<?php

namespace Tests\Feature;

use App\Exceptions\ApiError;
use App\Support\ErrorVocabulary;
use Illuminate\Foundation\Http\FormRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * Vocabulary guard: every machine token the API can emit must have French copy
 * in web/src/i18n/fr.ts.
 *
 * WHY THIS EXISTS. translateApiError() in that file is the ONLY place French is
 * computed in the whole system. It looks up three vocabularies — `code` under
 * `errors.*`, `fields[].reason` under `validation.*` and `fields[].field` under
 * `fields.*` — and a miss does not throw. A missing code or reason degrades to
 * the generic "Une erreur est survenue"; a missing field name leaks the raw
 * ENGLISH identifier onto a French user's screen; and a token whose French
 * interpolates would print a literal {{placeholder}}. All of that is silent.
 * That class of bug was introduced three times during this migration and caught
 * three times by hand — this makes it mechanical.
 *
 * DERIVATION, NOT DUPLICATION. Hardcoding the token lists here would just move
 * the rot: the list would go stale the first time a controller gained a new
 * code. So each list is read out of the code that emits it —
 * ApiError::REASONS by reflection, the FormRequests' rules() keys by
 * reflection, and the hand-rolled `'code'`/`'reason'`/`'field'` literals by
 * scanning app/. Only the handful of tokens no mechanical read can see are
 * listed explicitly, each with the construct it comes from.
 *
 * Because derivation can under-report (a regex that matches nothing would make
 * this test vacuously green), every derived list is itself checked against a
 * floor of tokens known to be reachable — see the MUST_INCLUDE_* constants.
 *
 * It extends PHPUnit's TestCase rather than Tests\TestCase: it reads source
 * files and uses reflection, and needs no booted framework.
 */
class ApiErrorVocabularyTest extends TestCase
{
    /**
     * Candidate locations of the vocabulary, because the two layouts differ.
     *
     * In the repository tree — a developer's checkout and CI — it sits at
     * <root>/web/src/i18n/fr.ts, three levels up from this file. In the dev
     * container the document root is the BUILT artifact, which contains only
     * hashed bundles, so the source is not reachable from _api/ at all;
     * docker-compose.yml mounts the tracked web/ read-only at /srv/web purely
     * so this guard can still read it. The suite runs with a -w of
     * /var/www/html/_api, so neither cwd nor one absolute path would do.
     *
     * (api/app/ needs no such list: this file sits inside api/, so ../../app is
     * the same relative path in both layouts.)
     */
    private const I18N_PATHS = [
        __DIR__.'/../../../web/src/i18n/fr.ts',
        '/srv/web/src/i18n/fr.ts',
    ];

    /** The Laravel app tree scanned for hand-rolled token literals. */
    private const APP_DIR = __DIR__.'/../../app';

    /**
     * Scanned alongside app/, because several exception renderers live there and
     * emit codes directly.
     *
     * This was a blind spot twice over. The scan originally covered app/ only,
     * so `rate_limited` — raised by the ThrottleRequestsException renderer in
     * bootstrap/app.php — read as "documented but never emitted" while being
     * emitted on every rate-limited public request. Directories are not the
     * boundary that matters here; "everywhere a code literal can appear" is.
     */
    private const BOOTSTRAP_FILE = __DIR__.'/../../bootstrap/app.php';

    /**
     * Reason tokens no scan of `'reason' =>` literals can see.
     *
     * - invalid_format: ApiError::validation()'s fallback for any rule absent
     *   from REASONS, written as `self::REASONS[$rule] ?? 'invalid_format'`.
     */
    private const EXTRA_REASONS = ['invalid_format'];

    /**
     * Field names no FormRequest and no `'field' =>` literal carries.
     *
     * - username, password: AuthController::login() validates them with an
     *   inline $request->validate([...]) rather than a FormRequest, so they are
     *   not reachable through the Requests/ reflection below.
     */
    private const EXTRA_FIELDS = ['username', 'password'];

    /**
     * The second way a code reaches a response: carried on an exception.
     *
     * These four classes take the code as a constructor argument and are
     * rendered by closures in bootstrap/app.php, which sits outside APP_DIR —
     * so a scan for `::json(<status>, '<code>'` never encounters them.
     *
     * THIS REPLACED A HAND-WRITTEN EXTRA_CODES LIST, and the replacement is the
     * point. That list named the three AccessIntegrityViolation codes and was
     * never extended when AttendanceRefused and ReauthenticationFailed arrived,
     * so `answer_already_settled`, `cannot_record_for_self`, `not_answerable`
     * and `reauth_failed` were invisible to the scan — and
     * test_every_emittable_code_has_french_copy was quietly not checking any of
     * them. They happened to have French. A list that must be remembered is a
     * list that will not be; a pattern that matches the CONSTRUCT covers every
     * future one for free.
     */
    private const CODE_CARRYING_EXCEPTIONS = [
        'AccessIntegrityViolation',
        'AttendanceRefused',
        'ReauthenticationFailed',
        'SchemaUnavailable',
    ];

    /**
     * Floors for the derived lists, so a derivation that silently stops working
     * fails loudly instead of passing on an empty set. These are NOT the
     * authoritative lists — the derivations are; growing one of those needs no
     * edit here.
     */
    private const MUST_INCLUDE_REASONS = [
        'required', 'too_long', 'invalid_format', 'invalid_type',
        'invalid_value', 'invalid_number',
    ];

    private const MUST_INCLUDE_CODES = [
        'validation_failed', 'not_authenticated', 'access_denied',
        'method_not_allowed', 'invalid_session', 'invalid_credentials',
        'service_unavailable', 'cannot_remove_last_administrator',
        'cannot_demote_self', 'cannot_delete_self',
        // One from each code-carrying exception class, so a regex that stops
        // matching that construct fails here rather than silently shrinking the
        // derived set — which is exactly how these four went unchecked before.
        'not_answerable', 'reauth_failed', 'answer_already_settled',
        // Emitted from bootstrap/app.php, not from app/ — the floor that keeps
        // that file in the scan.
        'rate_limited',
    ];

    private const MUST_INCLUDE_FIELDS = [
        'lastName', 'firstName', 'email', 'subject', 'message',
    ];

    /*
     * There is deliberately NO exemption list here.
     *
     * This file once carried a KNOWN_GAPS constant holding the single token the
     * guard found untranslated (fields.weekend), paired with a test that failed
     * the moment the French copy landed — a self-deleting escape hatch. The copy
     * landed, so both are gone. An empty exemption list is an invitation to add
     * the next entry; a missing one means the only way to satisfy this guard is
     * to write the French.
     */

    // ---------------------------------------------------------------- the tests

    public function test_every_emittable_reason_has_french_copy(): void
    {
        $this->assertVocabularyCovered('reasons', 'validation', $this->emittableReasons());
    }

    public function test_every_emittable_code_has_french_copy(): void
    {
        $this->assertVocabularyCovered('codes', 'errors', $this->emittableCodes());
    }

    public function test_every_emittable_field_has_french_copy(): void
    {
        $this->assertVocabularyCovered('fields', 'fields', $this->emittableFields());
    }

    /**
     * App\Support\ErrorVocabulary is CHECKED against the source scan, in both
     * directions, rather than trusted.
     *
     * That is what makes it a description of the API rather than a wish about
     * it. It feeds three readers — the OpenAPI `code` enum, the problem-type
     * pages at /api/problems, and the French-coverage test above — and a
     * hand-maintained list feeding three readers is exactly the sort of thing
     * that rots six months after the person who wrote it moved on.
     *
     * Both directions matter, and they catch opposite mistakes. A code the
     * source emits but the vocabulary omits ships a problem type with no
     * documentation, and a `type` URI that 404s. A code the vocabulary
     * documents but nothing emits publishes a page for an error that cannot
     * happen, which is worse than no page: a developer reads it and writes a
     * branch that never runs.
     */
    public function test_the_error_vocabulary_matches_what_the_code_emits(): void
    {
        $emitted = $this->emittableCodes();
        $documented = ErrorVocabulary::codes();

        sort($emitted);
        sort($documented);

        self::assertSame($documented, $emitted, sprintf(
            "App\\Support\\ErrorVocabulary and the codes app/ actually emits disagree.\n"
            ."Emitted but undocumented: %s\n"
            ."Documented but never emitted: %s\n"
            .'Every code needs a status, a title and a detail sentence there — '
            .'it is what /api/problems/{code} serves, and what the `type` URI in '
            .'every problem document points at.',
            implode(', ', array_diff($emitted, $documented)) ?: '(none)',
            implode(', ', array_diff($documented, $emitted)) ?: '(none)',
        ));
    }

    /**
     * The reasons half of the same guarantee.
     *
     * Derived from ApiError::REASONS plus EXTRA_REASONS by emittableReasons(),
     * so this catches a rule mapped to a reason token nobody listed.
     */
    public function test_the_error_vocabulary_lists_every_emittable_reason(): void
    {
        $emitted = $this->emittableReasons();
        $documented = ErrorVocabulary::REASONS;

        sort($emitted);
        sort($documented);

        self::assertSame($documented, $emitted, sprintf(
            "App\\Support\\ErrorVocabulary::REASONS and the reasons app/ can emit disagree.\n"
            ."Emitted but unlisted: %s\nListed but never emitted: %s",
            implode(', ', array_diff($emitted, $documented)) ?: '(none)',
            implode(', ', array_diff($documented, $emitted)) ?: '(none)',
        ));
    }

    // ----------------------------------------------------------- the assertion

    /**
     * @param  string  $label  human name of the token category, for the message
     * @param  string  $section  the fr.ts section the tokens are looked up in
     * @param  list<string>  $tokens
     */
    private function assertVocabularyCovered(string $label, string $section, array $tokens): void
    {
        $existing = $this->i18nKeys($section);

        $missing = array_values(array_diff($tokens, $existing));

        self::assertSame([], $missing, sprintf(
            "web/src/i18n/fr.ts is missing French copy for %d %s token(s) the API can emit:\n  - %s\n\n"
            ."Each belongs under the `%s:` section of the exported `fr` object.\n"
            .'Without it translateApiError() degrades silently — a missing code or reason '
            ."becomes the generic \"Une erreur est survenue\", a missing field name puts the raw\n"
            .'English identifier on a French screen.',
            count($missing),
            $label,
            implode("\n  - ", array_map(fn ($t) => "{$section}.{$t}", $missing)),
            $section
        ));
    }

    // ---------------------------------------------------------- the derivations

    /**
     * Reason tokens: every value of ApiError::REASONS (read by reflection, so
     * this cannot drift from the map) plus every `'reason' => '...'` literal in
     * app/ (the hand-rolled ones in EventController and ResponseController) plus
     * EXTRA_REASONS.
     *
     * @return list<string>
     */
    private function emittableReasons(): array
    {
        $reasons = new ReflectionClass(ApiError::class);
        $map = $reasons->getConstant('REASONS');

        self::assertIsArray($map, 'ApiError::REASONS is no longer an array constant — this test reads it by reflection.');
        self::assertNotEmpty($map, 'ApiError::REASONS came back empty; the reflection read is broken.');

        return $this->normalise(array_merge(
            array_values($map),
            $this->scanAppFor("/'reason'\s*=>\s*'([a-z_]+)'/"),
            self::EXTRA_REASONS,
        ), self::MUST_INCLUDE_REASONS, 'reasons');
    }

    public function test_every_code_carries_the_status_the_source_emits_it_with(): void
    {
        // WHY THIS IS SCANNED AND NOT DERIVED. App\Support\ErrorVocabulary now
        // carries a status per code, and that status is what the OpenAPI
        // document groups its responses by — so the document, the extension
        // that builds it and the tests that read it all agree with the map by
        // construction. Filing a code under the wrong number would be invisible
        // to every one of them and wrong in every generated client. The only
        // way to catch it is to read the status off the CODE THAT RAISES IT,
        // which is what this does.
        $pairs = $this->emittedStatuses();

        // The floor, for the reason every derivation here has one: a regex that
        // stopped matching would make this vacuously green.
        self::assertGreaterThanOrEqual(
            20,
            count($pairs),
            'Found almost no status/code pairs in app/; this scan has stopped matching.'
        );

        $wrong = [];

        foreach ($pairs as $code => $statuses) {
            $declared = ErrorVocabulary::statusFor($code);

            foreach (array_unique($statuses) as $status) {
                if ($declared !== $status) {
                    $wrong[] = sprintf(
                        '%s is raised with %d and the vocabulary says %s',
                        $code,
                        $status,
                        $declared === null ? 'nothing' : (string) $declared,
                    );
                }
            }
        }

        self::assertSame([], $wrong, sprintf(
            'The vocabulary disagrees with the code about what status a failure carries:
  - %s

'
            .'One status per code is a property of this vocabulary: where a refusal has two '
            .'statuses it has two codes, so that a caller branching on `code` never has to read '
            .'`status` as well.',
            implode('
  - ', $wrong)
        ));
    }

    /**
     * code => the statuses app/ actually raises it with.
     *
     * Three sources, because a status reaches a response three ways:
     *
     *  - a literal `::json(<status>, '<code>'`, which covers ApiError's own
     *    renderers, the controllers and the middleware;
     *  - `new AttendanceRefused(<status>, '<code>'` and ReauthenticationFailed,
     *    which carry their own because theirs varies;
     *  - AccessIntegrityViolation, which carries NO status — the render closure
     *    in bootstrap/app.php supplies it, so that literal is read from there
     *    rather than assumed here.
     *
     * @return array<string, list<int>>
     */
    private function emittedStatuses(): array
    {
        $pairs = [];

        $collect = function (string $pattern) use (&$pairs): void {
            foreach ([...$this->phpFiles(self::APP_DIR), self::BOOTSTRAP_FILE] as $file) {
                if (! preg_match_all($pattern, (string) file_get_contents($file), $m, PREG_SET_ORDER)) {
                    continue;
                }

                foreach ($m as $match) {
                    $pairs[$match[2]][] = (int) $match[1];
                }
            }
        };

        $collect("/::json\(\s*(\d{3})\s*,\s*'([a-z_]+)'/");
        $collect(sprintf(
            "/new\s+(?:%s)\(\s*(\d{3})\s*,\s*'([a-z_]+)'/",
            implode('|', self::CODE_CARRYING_EXCEPTIONS),
        ));

        foreach ($this->rendererSuppliedStatuses() as $code => $status) {
            $pairs[$code][] = $status;
        }

        return $pairs;
    }

    /**
     * The codes whose status lives in a render closure rather than at the throw.
     *
     * AccessIntegrityViolation is the only one: every violation it carries is a
     * conflict, so bootstrap/app.php renders the lot at one status and the
     * throw sites name only the code. Reading that literal out of the closure
     * keeps this test anchored on the source rather than on a number repeated
     * here.
     *
     * @return array<string, int>
     */
    private function rendererSuppliedStatuses(): array
    {
        $bootstrap = (string) file_get_contents(self::BOOTSTRAP_FILE);

        if (! preg_match('/AccessIntegrityViolation \$e.*?ApiError::json\(\s*(\d{3})/s', $bootstrap, $m)) {
            self::fail('Cannot find the AccessIntegrityViolation renderer in bootstrap/app.php, so its status is unchecked.');
        }

        $status = (int) $m[1];
        $found = [];

        foreach ($this->phpFiles(self::APP_DIR) as $file) {
            if (preg_match_all("/new\s+AccessIntegrityViolation\(\s*'([a-z_]+)'/", (string) file_get_contents($file), $codes)) {
                foreach ($codes[1] as $code) {
                    $found[$code] = $status;
                }
            }
        }

        self::assertNotEmpty($found, 'Found no AccessIntegrityViolation throw sites; this scan has stopped matching.');

        return $found;
    }

    /**
     * Code tokens: every `::json(<status>, '<code>'` call site in app/ — which
     * covers both ApiError's own named helpers (self::json(401,
     * 'not_authenticated', …)) and the controllers' direct ApiError::json(…)
     * calls, including SignupController's multi-line one — plus EXTRA_CODES.
     *
     * @return list<string>
     */
    private function emittableCodes(): array
    {
        // `new SomeRefusal(..., 'the_code', ...)` — the code is not always the
        // first argument (AttendanceRefused and ReauthenticationFailed put the
        // status first, because theirs varies), so this takes the first
        // snake_case string literal inside the constructor call rather than
        // assuming a position. [^)]* keeps it inside that call.
        $carried = sprintf(
            "/new\s+(?:%s)\(\s*[^)]*?'([a-z_]{4,})'/",
            implode('|', self::CODE_CARRYING_EXCEPTIONS),
        );

        return $this->normalise(array_merge(
            $this->scanAppFor("/::json\(\s*\d+\s*,\s*'([a-z_]+)'/"),
            $this->scanAppFor($carried),
        ), self::MUST_INCLUDE_CODES, 'codes');
    }

    /**
     * Field tokens: the rules() keys of every FormRequest under
     * app/Http/Requests (discovered by globbing the directory, so a new
     * FormRequest is covered without editing this test) plus every
     * `'field' => '...'` literal in app/ plus EXTRA_FIELDS.
     *
     * @return list<string>
     */
    private function emittableFields(): array
    {
        $files = glob(self::APP_DIR.'/Http/Requests/*.php') ?: [];
        self::assertNotEmpty($files, 'Found no FormRequests under '.self::APP_DIR.'/Http/Requests.');

        $fields = [];
        foreach ($files as $file) {
            $class = 'App\\Http\\Requests\\'.basename($file, '.php');
            self::assertTrue(class_exists($class), "Expected {$class} to exist for {$file}.");
            self::assertTrue(
                is_subclass_of($class, FormRequest::class),
                "{$class} is not a FormRequest; this derivation assumes it is."
            );

            $instance = new $class;
            self::assertTrue(
                method_exists($instance, 'rules'),
                "{$class} has no rules() for this derivation to read."
            );
            $rules = $instance->rules();
            self::assertNotEmpty($rules, "{$class}::rules() came back empty.");

            // Two reductions, each mirroring exactly what translateApiError
            // does before it looks a label up. Asking for a token the SPA
            // never requests would demand French copy for a key nothing reads,
            // while leaving the real one unchecked.
            //
            // 1. `roleIds.*` is rule syntax, not a field name. Laravel reports
            //    the failure against `roleIds.0`, and the SPA strips the index
            //    — so the token that must exist is `roleIds`.
            // 2. A NESTED path resolves to its last segment.
            //    StoreEventSeriesRequest nests the event under `template`, so
            //    Laravel reports `template.endTime`; the SPA tries that whole
            //    path, then falls back to `endTime`, whose French is the same
            //    words. This checks the fallback target, which is the one the
            //    catalogue actually carries.
            $fields = array_merge($fields, array_map(
                function (string $key): string {
                    $stripped = preg_replace('/\.(\*|\d+)(?=\.|$)/', '', $key) ?? $key;
                    $segments = explode('.', $stripped);

                    return end($segments) ?: $stripped;
                },
                array_map('strval', array_keys($rules)),
            ));
        }

        return $this->normalise(array_merge(
            $fields,
            $this->scanAppFor("/'field'\s*=>\s*'([A-Za-z_][A-Za-z0-9_]*)'/"),
            self::EXTRA_FIELDS,
        ), self::MUST_INCLUDE_FIELDS, 'fields');
    }

    /**
     * Every capture-group-1 match of $pattern across app/'s PHP files.
     *
     * @return list<string>
     */
    private function scanAppFor(string $pattern): array
    {
        self::assertFileExists(self::BOOTSTRAP_FILE, 'Cannot scan bootstrap/app.php for hand-rolled tokens.');

        $found = [];
        foreach ([...$this->phpFiles(self::APP_DIR), self::BOOTSTRAP_FILE] as $file) {
            if (preg_match_all($pattern, (string) file_get_contents($file), $m)) {
                $found = array_merge($found, $m[1]);
            }
        }

        return $found;
    }

    /** @return list<string> */
    private function phpFiles(string $dir): array
    {
        self::assertDirectoryExists($dir, 'Cannot scan the Laravel app tree for hand-rolled tokens.');

        $files = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $entry) {
            if ($entry->isFile() && $entry->getExtension() === 'php') {
                $files[] = $entry->getPathname();
            }
        }
        self::assertNotEmpty($files, "Found no PHP files under {$dir}; the scan is broken.");
        sort($files);

        return $files;
    }

    /**
     * De-duplicate, sort, and assert the derivation found at least the tokens
     * already known to be reachable.
     *
     * @param  list<string>  $tokens
     * @param  list<string>  $floor
     * @return list<string>
     */
    private function normalise(array $tokens, array $floor, string $label): array
    {
        $tokens = array_values(array_unique($tokens));
        sort($tokens);

        $undetected = array_values(array_diff($floor, $tokens));
        self::assertSame([], $undetected, sprintf(
            "The %s derivation stopped finding token(s) known to be reachable: %s.\n"
            .'That means this guard is checking less than it should — fix the derivation '
            .'(reflection target renamed? source scan pattern stale?) rather than the floor, '
            .'unless the token genuinely can no longer be emitted.',
            $label,
            implode(', ', $undetected)
        ));

        return $tokens;
    }

    // -------------------------------------------------------------- fr.ts read

    /**
     * The keys defined under one flat section of fr.ts's
     * resources.fr.translation object.
     *
     * @return list<string>
     */
    private function i18nKeys(string $section): array
    {
        $source = $this->blankNonCode($this->i18nSource());

        // Keys are matched as BARE identifiers, which is how fr.ts writes them.
        // Quoting one would hide it from this reader — but blanking is
        // length-preserving and only ever removes keys, so the failure direction
        // is a loud "missing French copy for X", never a silent pass.
        $anchor = preg_quote($section, '/');
        if (! preg_match('/(?:^|[{,])\s*'.$anchor.'\s*:\s*\{/', $source, $m, PREG_OFFSET_CAPTURE)) {
            self::fail(
                "fr.ts has no `{$section}:` section, so the API's tokens for it cannot be checked at all. "
                .'If the section was renamed, update this test to match.'
            );
        }

        // Walk from the section's opening brace to its match. Safe to brace-count
        // because blankNonCode() has emptied every string literal and comment, so
        // no `{{max}}` interpolation placeholder — nor a brace or apostrophe in a
        // comment — can be mistaken for structure.
        $open = strpos($source, '{', $m[0][1] + strlen($m[0][0]) - 1);
        $depth = 0;
        $end = null;
        for ($i = $open, $len = strlen($source); $i < $len; $i++) {
            if ($source[$i] === '{') {
                $depth++;
            } elseif ($source[$i] === '}') {
                if (--$depth === 0) {
                    $end = $i;
                    break;
                }
            }
        }
        self::assertNotNull($end, "Unbalanced braces while reading fr.ts's `{$section}:` section.");

        $block = substr($source, $open, $end - $open + 1);
        preg_match_all('/(?:^|[{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/', $block, $keys);

        self::assertNotEmpty($keys[1], "fr.ts's `{$section}:` section parsed as empty; this reader is broken.");

        return array_values(array_unique($keys[1]));
    }

    private function i18nSource(): string
    {
        foreach (self::I18N_PATHS as $path) {
            if (is_file($path)) {
                return (string) file_get_contents($path);
            }
        }

        // Fail loudly rather than skip: a silently-skipped vocabulary guard
        // reports green while checking nothing, which is worse than not having it
        // — the untranslated-token bugs it exists to catch are themselves silent.
        self::fail(
            "Cannot find web/src/i18n/fr.ts, so the API's error vocabulary is unchecked. "
            ."Looked for:\n  - ".implode("\n  - ", self::I18N_PATHS)
            ."\nIf the file moved, add its new location to ApiErrorVocabularyTest::I18N_PATHS."
        );
    }

    /**
     * Blank out every JS string literal and comment, replacing each with spaces
     * of the same length (newlines kept, so offsets and line structure survive).
     * What is left is structure and key names only.
     *
     * Both are blanked for the same reason — anything that is not code can carry
     * a character this reader treats as structure. A `{{max}}` placeholder in the
     * French copy looks like a brace; an apostrophe in a comment looks like a
     * quote; `}` in prose closes a section early. The alternation is ordered and
     * scanned left to right, so a `//` inside a string is consumed as part of the
     * string, not mistaken for a comment.
     */
    private function blankNonCode(string $source): string
    {
        $pattern = '~"(?:[^"\\\\\n]|\\\\.)*"'   // double-quoted string
            .'|\'(?:[^\'\\\\\n]|\\\\.)*\''      // single-quoted string
            .'|//[^\n]*'                        // line comment
            .'|/\*.*?\*/~s';                    // block comment

        return (string) preg_replace_callback(
            $pattern,
            fn (array $m) => preg_replace('/[^\n]/', ' ', $m[0]),
            $source
        );
    }
}

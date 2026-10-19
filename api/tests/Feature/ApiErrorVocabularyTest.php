<?php

namespace Tests\Feature;

use App\Exceptions\ApiError;
use App\Support\ErrorVocabulary;
use App\Support\ImageSet;
use App\Support\JpegInspector;
use Illuminate\Foundation\Http\FormRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * Vocabulary guard: every machine token the API can emit must have copy in
 * every locale the SPA ships, web/src/i18n/fr.ts and web/src/i18n/de.ts.
 *
 * translateApiError() is the only place either language is computed. It looks
 * up `code` under `errors.*`, `errors[].reason` under `validation.*` and
 * `errors[].field` under `fields.*`, and a miss does not throw: a missing code
 * or reason degrades to the generic fallback sentence, a missing field name
 * puts the raw English identifier on screen, and copy that interpolates would
 * print a literal {{placeholder}}. A token missing from one locale falls back
 * to French through i18next's fallbackLng. All of it is silent.
 *
 * Each token list is read out of the code that emits it, so it cannot go
 * stale: ApiError::REASONS and the FormRequests' rules() keys by reflection,
 * the hand-rolled `'code'`/`'reason'`/`'field'` literals by scanning app/.
 * Only the few tokens no mechanical read can see are listed explicitly, each
 * with the construct it comes from.
 *
 * A regex that matches nothing would make this vacuously green, so every
 * derived list is checked against a floor of tokens known to be reachable
 * (the MUST_INCLUDE_* constants).
 *
 * It extends PHPUnit's TestCase rather than Tests\TestCase: it reads source
 * files and uses reflection, and needs no booted framework.
 */
class ApiErrorVocabularyTest extends TestCase
{
    /**
     * Where each locale's vocabulary lives: <root>/web/src/i18n/<locale>.ts,
     * three levels up from this file.
     *
     * A developer's checkout, CI, a web session and the compose `php` service
     * (which mounts the repository at /repo) all run the suite from the
     * repository tree. Inside `web` this fails: that container's document root
     * is the built artifact, with no web/ source.
     *
     * A list, so the failure message can name every place it looked.
     */
    private const I18N_DIRS = [
        __DIR__.'/../../../web/src/i18n',
    ];

    /**
     * Every locale the SPA ships, each of which must carry copy for every token.
     * Without German here, i18next's fallbackLng would show a German reader a
     * French message for any untranslated token.
     */
    private const LOCALES = ['fr', 'de'];

    /** The Laravel app tree scanned for hand-rolled token literals. */
    private const APP_DIR = __DIR__.'/../../app';

    /**
     * Scanned alongside app/, because several exception renderers live there and
     * emit codes directly, `rate_limited` from the ThrottleRequestsException
     * renderer among them.
     */
    private const BOOTSTRAP_FILE = __DIR__.'/../../bootstrap/app.php';

    /**
     * Reason tokens no scan of `'reason' =>` literals can see.
     *
     * - invalid_format: ApiError::validation()'s fallback for any rule absent
     *   from REASONS, written as `self::REASONS[$rule] ?? 'invalid_format'`.
     *
     * App\Support\JpegInspector::PROBLEMS and App\Support\ImageSet::PROBLEMS
     * are read alongside, in emittableReasons(): StoreImageRequest::after()
     * adds each of those as a reason through a variable, so no literal scan
     * can see them.
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
     * These classes take the code as a constructor argument and are rendered by
     * closures in bootstrap/app.php, so a scan for `::json(<status>, '<code>'`
     * never meets them. The scan matches the `new <Class>(` construct, so every
     * throw site is covered without listing its codes; a hand-written code list
     * is one somebody forgets to extend.
     */
    private const CODE_CARRYING_EXCEPTIONS = [
        'AccessIntegrityViolation',
        'AttendanceRefused',
        'ReauthenticationFailed',
        'SchemaUnavailable',
    ];

    /**
     * Floors for the derived lists, so a derivation that stops working fails
     * instead of passing on an empty set. The derivations are the
     * authoritative lists; growing one needs no edit here.
     */
    private const MUST_INCLUDE_REASONS = [
        'required', 'too_long', 'invalid_format', 'invalid_type',
        'invalid_value', 'invalid_number',
        // The floor for the errors()->add() scan.
        'too_many_guests',
    ];

    private const MUST_INCLUDE_CODES = [
        'validation_failed', 'not_authenticated', 'access_denied',
        'method_not_allowed', 'invalid_session', 'invalid_credentials',
        'service_unavailable', 'cannot_remove_last_administrator',
        'cannot_demote_self', 'cannot_delete_self',
        // Code-carrying exceptions, so a regex that stops matching that
        // construct fails here instead of shrinking the derived set.
        'not_answerable', 'reauth_failed', 'answer_already_settled',
        // Emitted from bootstrap/app.php, not from app/: keeps that file in
        // the scan.
        'rate_limited',
    ];

    private const MUST_INCLUDE_FIELDS = [
        'lastName', 'firstName', 'email', 'subject', 'message',
    ];

    /*
     * There is deliberately no exemption list here. An empty one invites the
     * next entry; without one, the only way to satisfy this guard is to write
     * the copy.
     */

    // ---------------------------------------------------------------- the tests

    public function test_every_emittable_reason_has_copy_in_every_locale(): void
    {
        $this->assertVocabularyCovered('reasons', 'validation', $this->emittableReasons());
    }

    public function test_every_emittable_code_has_copy_in_every_locale(): void
    {
        $this->assertVocabularyCovered('codes', 'errors', $this->emittableCodes());
    }

    public function test_every_emittable_field_has_copy_in_every_locale(): void
    {
        $this->assertVocabularyCovered('fields', 'fields', $this->emittableFields());
    }

    /**
     * App\Support\ErrorVocabulary is checked against the source scan in both
     * directions, so it describes the API instead of a wish about it. It feeds
     * the OpenAPI `code` enum and the locale-coverage tests above.
     *
     * The two directions catch opposite mistakes. A code the source emits but
     * the vocabulary omits ships with no status, title or detail. A code the
     * vocabulary lists but nothing emits documents an error that cannot
     * happen, and a developer writes a branch for it that never runs.
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
     * @param  string  $section  the i18n section the tokens are looked up in
     * @param  list<string>  $tokens
     */
    private function assertVocabularyCovered(string $label, string $section, array $tokens): void
    {
        foreach (self::LOCALES as $locale) {
            $existing = $this->i18nKeys($section, $locale);

            $missing = array_values(array_diff($tokens, $existing));

            self::assertSame([], $missing, sprintf(
                "web/src/i18n/%s.ts is missing copy for %d %s token(s) the API can emit:\n  - %s\n\n"
                ."Each belongs under the `%s:` section of the exported `%s` object.\n"
                .'Without it translateApiError() degrades silently — a missing code or reason '
                ."becomes the generic fallback sentence, a missing field name puts the raw\n"
                .'English identifier on the screen.',
                $locale,
                count($missing),
                $label,
                implode("\n  - ", array_map(fn ($t) => "{$section}.{$t}", $missing)),
                $section,
                $locale
            ));
        }
    }

    // ---------------------------------------------------------- the derivations

    /**
     * Reason tokens: every value of ApiError::REASONS (read by reflection, so
     * this cannot drift from the map) plus every `'reason' => '...'` literal in
     * app/ (hand-rolled, as in EventController), plus JpegInspector::PROBLEMS,
     * ImageSet::PROBLEMS and EXTRA_REASONS.
     *
     * @return list<string>
     */
    private function emittableReasons(): array
    {
        $reasons = new ReflectionClass(ApiError::class);
        $map = $reasons->getConstant('REASONS');

        self::assertIsArray($map, 'ApiError::REASONS is no longer an array constant — this test reads it by reflection.');
        self::assertNotEmpty($map, 'ApiError::REASONS came back empty; the reflection read is broken.');

        self::assertNotEmpty(JpegInspector::PROBLEMS, 'JpegInspector::PROBLEMS came back empty.');
        self::assertNotEmpty(ImageSet::PROBLEMS, 'ImageSet::PROBLEMS came back empty.');

        return $this->normalise(array_merge(
            array_values($map),
            $this->scanAppFor("/'reason'\s*=>\s*'([a-z_]+)'/"),
            // Literal reasons a FormRequest's after() hook adds, as
            // StoreRegistrationRequest does with too_many_guests (#230).
            // Neither ApiError::REASONS nor the `'reason' =>` scan sees them.
            $this->scanAppFor("/errors\(\)->add\(\s*['\"][^'\"]*['\"]\s*,\s*'([a-z_]+)'\s*\)/"),
            JpegInspector::PROBLEMS,
            ImageSet::PROBLEMS,
            self::EXTRA_REASONS,
        ), self::MUST_INCLUDE_REASONS, 'reasons');
    }

    public function test_every_code_carries_the_status_the_source_emits_it_with(): void
    {
        // Scanned, not derived. App\Support\ErrorVocabulary carries a status
        // per code, and the OpenAPI document groups its responses by it, so
        // the document, its extension and the tests that read it agree with
        // the map by construction. A code filed under the wrong status would
        // be invisible to all of them and wrong in every generated client, so
        // the status is read off the code that raises it.
        $pairs = $this->emittedStatuses();

        // A floor: a regex that stopped matching would make this vacuously
        // green.
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
     *  - AccessIntegrityViolation, which carries no status: the render closure
     *    in bootstrap/app.php supplies it, so the literal is read from there.
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
     * throw sites name only the code. The status is read out of the closure,
     * not repeated here.
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
     * Code tokens: every `::json(<status>, '<code>'` call site in app/ and
     * bootstrap/app.php (ApiError's own named helpers such as
     * self::json(401, 'not_authenticated', …) and the controllers' direct
     * ApiError::json(…) calls), plus every code a CODE_CARRYING_EXCEPTIONS
     * class is constructed with.
     *
     * @return list<string>
     */
    private function emittableCodes(): array
    {
        // `new SomeRefusal(..., 'the_code', ...)`: the code is not always the
        // first argument (AttendanceRefused and ReauthenticationFailed put the
        // status first, because theirs varies), so this takes the first
        // snake_case string literal inside the call. [^)]* keeps it there.
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

            // Two reductions, mirroring what translateApiError does before it
            // looks a label up, so this checks the key the SPA actually reads.
            //
            // 1. `roleIds.*` is rule syntax. Laravel reports `roleIds.0` and
            //    the SPA strips the index, so the token is `roleIds`.
            // 2. A nested path resolves to its last segment.
            //    StoreEventSeriesRequest nests the event under `template`, so
            //    Laravel reports `template.endTime`; the SPA tries that path,
            //    then falls back to `endTime`, which the catalogue carries.
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

    // ----------------------------------------------------------- i18n catalogue read

    /**
     * The keys defined under one flat section of a locale's exported
     * catalogue object.
     *
     * @return list<string>
     */
    private function i18nKeys(string $section, string $locale): array
    {
        $source = $this->blankNonCode($this->i18nSource($locale));

        // Keys are matched as bare identifiers, as the catalogues write them.
        // A quoted key is blanked and so hidden from this reader, which can
        // only fail as "missing copy for X", never pass silently.
        $anchor = preg_quote($section, '/');
        if (! preg_match('/(?:^|[{,])\s*'.$anchor.'\s*:\s*\{/', $source, $m, PREG_OFFSET_CAPTURE)) {
            self::fail(
                "{$locale}.ts has no `{$section}:` section, so the API's tokens for it cannot be checked at all. "
                .'If the section was renamed, update this test to match.'
            );
        }

        // Walk from the section's opening brace to its match. Brace-counting is
        // safe because blankNonCode() has emptied every string and comment, so
        // no `{{max}}` placeholder or stray brace can pass for structure.
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
        self::assertNotNull($end, "Unbalanced braces while reading {$locale}.ts's `{$section}:` section.");

        $block = substr($source, $open, $end - $open + 1);
        preg_match_all('/(?:^|[{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/', $block, $keys);

        self::assertNotEmpty($keys[1], "{$locale}.ts's `{$section}:` section parsed as empty; this reader is broken.");

        return array_values(array_unique($keys[1]));
    }

    private function i18nSource(string $locale): string
    {
        foreach (self::I18N_DIRS as $dir) {
            $path = "{$dir}/{$locale}.ts";

            if (is_file($path)) {
                return (string) file_get_contents($path);
            }
        }

        // Fail rather than skip: a skipped guard reports green while checking
        // nothing, and the bugs it catches are silent themselves.
        self::fail(
            "Cannot find web/src/i18n/{$locale}.ts, so the API's error vocabulary is unchecked for that locale. "
            ."Looked in:\n  - ".implode("\n  - ", self::I18N_DIRS)
            ."\nIf the files moved, update ApiErrorVocabularyTest::I18N_DIRS."
        );
    }

    /**
     * Blank out every JS string literal and comment, replacing each with spaces
     * of the same length (newlines kept, so offsets and line structure survive).
     * What is left is structure and key names only.
     *
     * Anything that is not code can carry a character this reader treats as
     * structure: a `{{max}}` placeholder looks like a brace, an apostrophe in a
     * comment like a quote. The alternation is scanned left to right, so a
     * `//` inside a string is consumed with the string.
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

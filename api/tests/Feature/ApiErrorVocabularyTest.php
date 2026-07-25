<?php

namespace Tests\Feature;

use App\Exceptions\ApiError;
use Illuminate\Foundation\Http\FormRequest;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * Vocabulary guard: every machine token the API can emit must have French copy
 * in app/assets/js/i18n.js.
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
     * Candidate locations of i18n.js, relative to this file, because the two
     * layouts differ: the repository tree has it at <root>/app/assets/js/, while
     * the web container's document root puts it at /var/www/html/assets/js/ with
     * this suite mounted alongside at /var/www/html/api-laravel/. The suite runs
     * with a -w of the latter, so neither cwd nor an absolute path would do.
     *
     * (api/app/ needs no such list: this file sits inside api/, so ../../app is
     * the same relative path in both layouts.)
     */
    private const I18N_PATHS = [
        __DIR__.'/../../../app/assets/js/i18n.js',
        __DIR__.'/../../../assets/js/i18n.js',
    ];

    /** The Laravel app tree scanned for hand-rolled token literals. */
    private const APP_DIR = __DIR__.'/../../app';

    /**
     * Reason tokens no scan of `'reason' =>` literals can see.
     *
     * - invalid_format: ApiError::validation()'s fallback for any rule absent
     *   from REASONS, written as `self::REASONS[$rule] ?? 'invalid_format'`, and
     *   also the token SignupRequest::after() adds for `menus` through
     *   $validator->errors()->add() — where the MESSAGE IS THE REASON, so the
     *   token never appears next to a `'reason' =>` key at all.
     */
    private const EXTRA_REASONS = ['invalid_format'];

    /**
     * Field names no FormRequest and no `'field' =>` literal carries.
     *
     * - username, password: AuthController::login() validates them with an
     *   inline $request->validate([...]) rather than a FormRequest, so they are
     *   not reachable through the Requests/ reflection below.
     * - menus: added by SignupRequest::after() via $validator->errors()->add(),
     *   deliberately NOT a rules() key (Occasion::normalizeMenus() validates it),
     *   so reflecting rules() cannot see it.
     */
    private const EXTRA_FIELDS = ['username', 'password', 'menus'];

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
        'event_not_found', 'service_unavailable', 'captcha_failed',
    ];

    private const MUST_INCLUDE_FIELDS = [
        'lastName', 'firstName', 'email', 'subject', 'message',
        'date', 'title', 'startTime', 'endTime', 'location', 'attire',
        'first_name', 'last_name', 'address', 'phone', 'table_name',
        'eventId', 'participation', 'id',
    ];

    /**
     * Tokens known to be missing from i18n.js, awaiting the maintainer's French
     * copy. Adding that copy is deliberately not this test's call, and this
     * suite may not edit i18n.js — so a genuine gap is parked here rather than
     * left as a red suite, and reported.
     *
     * `weekend` is a rules() key on EventRequest (`['nullable', 'boolean']`), so
     * a client sending a non-boolean gets fields[] = [{field: 'weekend', reason:
     * 'invalid_type'}] and i18n.js, having no `fields.weekend`, falls back to
     * echoing the raw English identifier: "weekend a un type invalide". The old
     * app could not emit it — App\Dto\EventInput declared $weekend as bare
     * `mixed` with no validation attributes — so this gap arrived with the
     * Laravel port. planning_repet.js always posts a real checkbox boolean, so
     * our own UI cannot trigger it; another client can.
     *
     * Suggested copy: fields.weekend => "Week-end".
     *
     * test_the_known_gap_list_is_still_needed below forces this list to shrink:
     * once the copy lands, the entry must be REMOVED or the suite fails. It
     * cannot rot into a permanent exemption.
     *
     * @var array<string, list<string>> category => tokens
     */
    private const KNOWN_GAPS = [
        'fields' => ['weekend'],
    ];

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
     * The KNOWN_GAPS escape hatch is only allowed to point at real gaps. The
     * moment the French copy lands, this fails and the entry has to go — which
     * is what stops a temporary exemption becoming a permanent hole in the guard.
     */
    public function test_the_known_gap_list_is_still_needed(): void
    {
        foreach (self::KNOWN_GAPS as $category => $tokens) {
            $existing = $this->i18nKeys($category);
            foreach ($tokens as $token) {
                self::assertNotContains(
                    $token,
                    $existing,
                    "i18n.js now defines {$category}.{$token}, so it is no longer a gap. "
                    .'Remove it from ApiErrorVocabularyTest::KNOWN_GAPS.'
                );
            }
        }
    }

    // ----------------------------------------------------------- the assertion

    /**
     * @param  string  $label  human name of the token category, for the message
     * @param  string  $section  the i18n.js section the tokens are looked up in
     * @param  list<string>  $tokens
     */
    private function assertVocabularyCovered(string $label, string $section, array $tokens): void
    {
        $existing = $this->i18nKeys($section);
        $exempt = self::KNOWN_GAPS[$section] ?? [];

        $missing = array_values(array_diff($tokens, $existing, $exempt));

        self::assertSame([], $missing, sprintf(
            "app/assets/js/i18n.js is missing French copy for %d %s token(s) the API can emit:\n  - %s\n\n"
            ."Each belongs under the `%s:` section of the resources.fr.translation object.\n"
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

    /**
     * Code tokens: every `::json(<status>, '<code>'` call site in app/ — which
     * covers both ApiError's own named helpers (self::json(401,
     * 'not_authenticated', …)) and the controllers' direct ApiError::json(…)
     * calls, including SignupController's multi-line one.
     *
     * @return list<string>
     */
    private function emittableCodes(): array
    {
        return $this->normalise(
            $this->scanAppFor("/::json\(\s*\d+\s*,\s*'([a-z_]+)'/"),
            self::MUST_INCLUDE_CODES,
            'codes'
        );
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

            $rules = (new $class)->rules();
            self::assertNotEmpty($rules, "{$class}::rules() came back empty.");
            $fields = array_merge($fields, array_map('strval', array_keys($rules)));
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
        $found = [];
        foreach ($this->phpFiles(self::APP_DIR) as $file) {
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

    // ------------------------------------------------------------- i18n.js read

    /**
     * The keys defined under one flat section of i18n.js's
     * resources.fr.translation object.
     *
     * @return list<string>
     */
    private function i18nKeys(string $section): array
    {
        $source = $this->blankNonCode($this->i18nSource());

        // Keys are matched as BARE identifiers, which is how i18n.js writes them.
        // Quoting one would hide it from this reader — but blanking is
        // length-preserving and only ever removes keys, so the failure direction
        // is a loud "missing French copy for X", never a silent pass.
        $anchor = preg_quote($section, '/');
        if (! preg_match('/(?:^|[{,])\s*'.$anchor.'\s*:\s*\{/', $source, $m, PREG_OFFSET_CAPTURE)) {
            self::fail(
                "i18n.js has no `{$section}:` section, so the API's tokens for it cannot be checked at all. "
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
        self::assertNotNull($end, "Unbalanced braces while reading i18n.js's `{$section}:` section.");

        $block = substr($source, $open, $end - $open + 1);
        preg_match_all('/(?:^|[{,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/', $block, $keys);

        self::assertNotEmpty($keys[1], "i18n.js's `{$section}:` section parsed as empty; this reader is broken.");

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
            "Cannot find app/assets/js/i18n.js, so the API's error vocabulary is unchecked. "
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

<?php

namespace Tests\Feature;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Access is decided by a permission and by nothing else (ADR 0014). This
 * reads app/ and fails on the two ways back to the model #189 retired:
 *
 * - THE REGISTER AS A GATE. Before #191 a member could answer an event
 *   because `section_id` was set (`Member::isPlayer()`), whatever their
 *   roles said. A register groups and displays, and grants nothing.
 * - A ROLE'S KEY AS A GATE. Roles are editable data that group permissions;
 *   a check on `'direction'` keeps passing after somebody moves the
 *   permission to another role, and then the role editor lies.
 *
 * Only app/ is scanned. Migrations and seeders have to name the seeded roles
 * to create them, and tests have to name them to build their personas.
 * Comments are stripped first, so explaining the old model stays allowed.
 *
 * A pattern that matches nothing makes this green forever, so each one is
 * also run against a sample of the code it exists to catch; see
 * test_each_pattern_catches_what_it_names().
 *
 * It extends PHPUnit's TestCase rather than Tests\TestCase: it reads source
 * files and needs no booted framework, like ApiErrorVocabularyTest.
 */
class AccessDecidedByPermissionTest extends TestCase
{
    private const APP_DIR = __DIR__.'/../../app';

    /**
     * Where authorization is computed. These must not mention a register at
     * all, not even to display one: nothing here displays anything.
     *
     * Controllers are not on the list, because several load `section` to show
     * it (the chase list is grouped by register). For them the rule is
     * narrower, the CALLER's register below, which is what a gate would read.
     */
    private const DECISION_FILES = [
        'Support/AccessIntegrity.php',
        'Support/AttendanceIntegrity.php',
        'Support/EffectivePermissions.php',
        'Http/Middleware/RequirePermission.php',
        'Http/Middleware/HideDraftEvents.php',
    ];

    /**
     * The seeded role keys no other vocabulary in app/ uses, so a string
     * literal of one is a role check and nothing else. `member` is a seeded
     * key too, but it is also an audit subject and an ETag facet, so it is
     * caught by the comparison patterns below instead of by its spelling.
     */
    private const ROLE_KEYS = ['direction', 'committee', 'musician'];

    /**
     * Ways of comparing against a role's key, or of finding a role by it.
     * Assigning one (`'key' => …`) and sorting by one are not comparisons and
     * stay allowed: a new role needs a key, and /me lists roles in key order.
     *
     * @var array<string, string>
     */
    private const ROLE_KEY_COMPARISONS = [
        'a comparison on ->key' => '/->key\s*(===|!==|==|!=)|(===|!==|==|!=)\s*\$[\w>\-?]*->key\b/',
        'a comparison on [\'key\']' => '/\[\s*[\'"]key[\'"]\s*\]\s*(===|!==|==|!=)/',
        'a lookup by key, where(\'key\', …) and kin' => '/\(\s*[\'"](roles\.)?key[\'"]\s*,/',
        'the keys plucked to be searched' => '/pluck\(\s*[\'"](roles\.)?key[\'"]\s*\)/',
        'in_array over a key' => '/in_array\(\s*\$[\w>\-?]*->key\b/',
        'a match on a key' => '/match\s*\(\s*\$[\w>\-?]*->key\s*\)/',
    ];

    /**
     * The caller's own register, or the helper that used to wrap it, read
     * anywhere in app/.
     *
     * @var array<string, string>
     */
    private const CALLER_REGISTER = [
        'isPlayer, the retired gate' => '/\bis_?player\b/i',
        'the caller\'s register' => '/(user\(\)|\$actor|\$caller)\??->(section\b|section_id\b)/',
    ];

    public function test_no_decision_file_mentions_a_register(): void
    {
        $offences = [];
        foreach (self::DECISION_FILES as $relative) {
            $path = self::APP_DIR.'/'.$relative;
            self::assertFileExists($path, "{$relative} moved; update DECISION_FILES so it is still checked.");

            foreach ($this->codeLines($path) as $line => $code) {
                if (preg_match('/section|is_?player/i', $code)) {
                    $offences[] = "{$relative}:{$line}  {$code}";
                }
            }
        }

        self::assertSame([], $offences,
            "Authorization reads a register. A register grants nothing; check a permission instead:\n".implode("\n", $offences));
    }

    public function test_nothing_in_app_gates_on_the_callers_register(): void
    {
        $this->assertNoMatches(self::CALLER_REGISTER,
            'A register grants nothing. Gate on a permission, e.g. attendance.respond');
    }

    public function test_nothing_in_app_names_a_seeded_role(): void
    {
        $offences = [];
        foreach ($this->appFiles() as $relative => $path) {
            foreach ($this->stringLiterals($path) as [$line, $value]) {
                if (in_array($value, self::ROLE_KEYS, true)) {
                    $offences[] = "{$relative}:{$line}  '{$value}'";
                }
            }
        }

        self::assertSame([], $offences,
            "app/ names a seeded role. Roles are data; check the permission the role grants:\n".implode("\n", $offences));
    }

    public function test_nothing_in_app_compares_a_role_key(): void
    {
        $this->assertNoMatches(self::ROLE_KEY_COMPARISONS,
            'Roles are data; check the permission the role grants, not which role it is');
    }

    /** @return array<string, array{string, string}> */
    public static function offendingSamples(): array
    {
        return [
            'isPlayer' => ['CALLER_REGISTER', 'if ($member->isPlayer()) {'],
            'is_player' => ['CALLER_REGISTER', '$row->is_player'],
            'the caller\'s section_id' => ['CALLER_REGISTER', 'if ($request->user()->section_id === null) {'],
            'the actor\'s section' => ['CALLER_REGISTER', 'abort_if($actor?->section === null, 403);'],
            'role key ===' => ['ROLE_KEY_COMPARISONS', 'if ($role->key === $wanted) {'],
            'reversed !==' => ['ROLE_KEY_COMPARISONS', 'return $wanted !== $role->key;'],
            'array key' => ['ROLE_KEY_COMPARISONS', "\$row['key'] == \$wanted"],
            'where' => ['ROLE_KEY_COMPARISONS', "Role::query()->where('key', \$wanted)->exists()"],
            'joined where' => ['ROLE_KEY_COMPARISONS', '->where("roles.key", $wanted)'],
            'contains' => ['ROLE_KEY_COMPARISONS', "\$member->roles->contains('key', \$wanted)"],
            'pluck' => ['ROLE_KEY_COMPARISONS', "\$member->roles->pluck('key')->contains(\$wanted)"],
            'in_array' => ['ROLE_KEY_COMPARISONS', 'in_array($role->key, $wanted, true)'],
            'match' => ['ROLE_KEY_COMPARISONS', 'return match ($role->key) {'],
        ];
    }

    /**
     * The proof each pattern is alive. Without it a typo in a regex would
     * leave the scan above passing over exactly the code it was written for.
     */
    #[DataProvider('offendingSamples')]
    public function test_each_pattern_catches_what_it_names(string $set, string $sample): void
    {
        /** @var array<string, string> $patterns */
        $patterns = constant(self::class.'::'.$set);
        $caught = array_filter($patterns, fn (string $pattern): bool => preg_match($pattern, $sample) === 1);

        self::assertNotEmpty($caught, "No pattern in {$set} catches: {$sample}");
    }

    public function test_what_stays_allowed_is_not_caught(): void
    {
        // Each of these is in app/ today, for a reason the rules accept.
        $allowed = [
            "'key' => 'custom-'.Str::lower((string) Str::ulid()),",
            "->sortBy('key')",
            "'sectionName' => \$member->section?->name,",
            "->with('section')",
        ];

        foreach ($allowed as $sample) {
            foreach ([...self::ROLE_KEY_COMPARISONS, ...self::CALLER_REGISTER] as $name => $pattern) {
                self::assertSame(0, preg_match($pattern, $sample), "\"{$name}\" wrongly catches: {$sample}");
            }
        }
    }

    /** @param array<string, string> $patterns */
    private function assertNoMatches(array $patterns, string $advice): void
    {
        $offences = [];
        foreach ($this->appFiles() as $relative => $path) {
            foreach ($this->codeLines($path) as $line => $code) {
                foreach ($patterns as $name => $pattern) {
                    if (preg_match($pattern, $code)) {
                        $offences[] = "{$relative}:{$line}  ({$name})  {$code}";
                    }
                }
            }
        }

        self::assertSame([], $offences, "{$advice}:\n".implode("\n", $offences));
    }

    /**
     * Every PHP file under app/, keyed by its path relative to app/. There
     * is no exemption list: nothing in app/ needs one today, and a file that
     * does should have to argue for it in this test, where review sees it.
     *
     * @return array<string, string>
     */
    private function appFiles(): array
    {
        self::assertDirectoryExists(self::APP_DIR, 'Cannot scan the Laravel app tree.');

        $files = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(self::APP_DIR, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $entry) {
            if ($entry->isFile() && $entry->getExtension() === 'php') {
                $relative = str_replace('\\', '/', substr($entry->getPathname(), strlen(self::APP_DIR) + 1));
                $files[$relative] = $entry->getPathname();
            }
        }

        // A floor, so a wrong APP_DIR cannot pass by scanning nothing.
        self::assertGreaterThan(50, count($files), 'Found almost no PHP files under app/; the scan is broken.');
        ksort($files);

        return $files;
    }

    /**
     * The file's lines with every comment blanked out, keyed by line number.
     * Blank lines are dropped.
     *
     * @return array<int, string>
     */
    private function codeLines(string $path): array
    {
        $code = '';
        foreach (token_get_all((string) file_get_contents($path)) as $token) {
            if (is_array($token) && in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                // Keep the newlines, so line numbers still point at the file.
                $code .= str_repeat("\n", substr_count($token[1], "\n"));
            } else {
                $code .= is_array($token) ? $token[1] : $token;
            }
        }

        $lines = [];
        foreach (explode("\n", $code) as $index => $line) {
            if (trim($line) !== '') {
                $lines[$index + 1] = trim($line);
            }
        }

        return $lines;
    }

    /**
     * Every single- or double-quoted string literal in the file, unquoted,
     * with the line it starts on.
     *
     * @return list<array{int, string}>
     */
    private function stringLiterals(string $path): array
    {
        $literals = [];
        foreach (token_get_all((string) file_get_contents($path)) as $token) {
            if (is_array($token) && $token[0] === T_CONSTANT_ENCAPSED_STRING) {
                $literals[] = [$token[2], substr($token[1], 1, -1)];
            }
        }

        return $literals;
    }
}

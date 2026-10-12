<?php

namespace Tests\Feature;

use App\Support\Permission;
use PHPUnit\Framework\TestCase;

/**
 * Every permission has a name and a hint in both catalogues.
 *
 * The role editor (#194) shows each permission as a checkbox, named from
 * web/src/i18n/<locale>.ts under `permissions`, keyed by the token with `_`
 * for `.`. A permission added to the enum without copy would show its raw
 * token on the committee's screen, and German would fall back to French
 * without anybody noticing, so this fails first.
 *
 * A plain PHPUnit TestCase: it reads three files and needs no framework.
 */
class PermissionCopyTest extends TestCase
{
    private const I18N_DIR = __DIR__.'/../../../web/src/i18n';

    public function test_every_permission_has_copy_in_every_locale(): void
    {
        foreach (['fr', 'de'] as $locale) {
            $block = $this->permissionsBlock($locale);
            $missing = [];

            foreach (Permission::cases() as $permission) {
                $key = str_replace('.', '_', $permission->value);

                if (! preg_match('/\n    '.$key.': \{\s*\n\s+label: "[^"]+",\s*\n\s+hint: "[^"]+",/', $block)) {
                    $missing[] = $permission->value;
                }
            }

            $this->assertSame([], $missing, sprintf(
                "web/src/i18n/%s.ts has no label and hint under `permissions` for:\n  - %s",
                $locale,
                implode("\n  - ", $missing),
            ));
        }
    }

    /** The top-level `permissions: { … },` of one catalogue, which the two-space indent delimits. */
    private function permissionsBlock(string $locale): string
    {
        $source = (string) file_get_contents(self::I18N_DIR."/{$locale}.ts");

        $this->assertMatchesRegularExpression(
            '/\n  permissions: \{\n(.*?)\n  \},\n/s',
            $source,
            "{$locale}.ts has no top-level `permissions:` section; this reader is broken or the section moved.",
        );
        preg_match('/\n  permissions: \{\n(.*?)\n  \},\n/s', $source, $match);

        return "\n".$match[1];
    }
}

<?php

namespace App;

/**
 * Feature flags read once from config.php's 'features' section in
 * bootstrap.php via Features::init(). Server-owned and hand-set per
 * environment, the same mechanism already used for db/mail credentials —
 * so a feature can go live on TEST/QA while staying off on PROD without a
 * separate deploy or a CI gate decision (see CLAUDE.md's Architecture
 * section: TEST/QA/PROD always run identical deployed bytes).
 *
 * An unknown or missing flag defaults to disabled, so a stale or absent
 * config key never accidentally turns a feature on.
 */
final class Features
{
    /** @var array<string,bool> */
    private static array $flags = [];

    /** @param array<string,mixed> $flags the $config['features'] section */
    public static function init(array $flags): void
    {
        self::$flags = array_map(static fn($v): bool => (bool) $v, $flags);
    }

    public static function enabled(string $name): bool
    {
        return self::$flags[$name] ?? false;
    }
}

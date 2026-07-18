<?php

namespace App;

/**
 * Holds the deployment environment (dev / test / qa / prod) for the current
 * request. Set once from config in bootstrap.php via Env::init(); read anywhere
 * (e.g. the env ribbon in partials/env_banner.php).
 *
 * Anything not one of the known non-prod environments collapses to 'prod', so a
 * missing or stale config key never accidentally shows a staging ribbon on the
 * live site.
 */
final class Env
{
    /** Non-prod environments and the ribbon label each one shows. */
    private const RIBBONS = [
        'dev'  => 'DEV',
        'test' => 'TEST',
        'qa'   => 'QA',
    ];

    private static string $env = 'prod';

    public static function init(?string $env): void
    {
        $normalised = strtolower(trim((string) $env));
        self::$env = isset(self::RIBBONS[$normalised]) ? $normalised : 'prod';
    }

    public static function current(): string
    {
        return self::$env;
    }

    public static function isProd(): bool
    {
        return self::$env === 'prod';
    }

    /** Ribbon label for the current env, or null for prod (no ribbon). */
    public static function ribbonLabel(): ?string
    {
        return self::RIBBONS[self::$env] ?? null;
    }
}

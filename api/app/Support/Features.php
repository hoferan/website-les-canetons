<?php

namespace App\Support;

/**
 * The complete set of feature flags GET /api/config exposes to the SPA.
 *
 * THE KEY SET IS FIXED IN CODE, NOT READ FROM THE ENVIRONMENT — the same
 * reason ConfigController never returns config() wholesale: this endpoint is
 * public and unauthenticated, and the config it draws its values from also
 * carries database and mail secrets. Reading arbitrary FEATURE_* keys out of
 * the environment would mean a stray key on some server's .env gets published
 * to the whole internet with no review. Instead, every flag this class can
 * ever report is listed here, once, by a developer — same posture as
 * App\Support\Permission.
 *
 * One flag for now: `calendar`. Its consumer arrives in R1c-2; it is declared
 * here so the mechanism has something real to carry and so the .env key can
 * be placed on servers before the feature lands.
 *
 * BOOLEAN CAST, NOT DECORATIVE. .env values arrive as strings, and
 * config/features.php's env('FEATURE_CALENDAR', false) only converts the
 * literal, unquoted `true`/`false` — anything written out longhand ('false',
 * '0', '') would otherwise reach the SPA as a non-empty string, which
 * JavaScript treats as truthy, permanently turning the flag on. filter_var()
 * with FILTER_VALIDATE_BOOLEAN is the belt-and-braces for that: '0' and ''
 * both read as false alongside 'false' itself.
 */
final class Features
{
    /** @return array<string, bool> */
    public static function all(): array
    {
        return [
            'calendar' => self::flag('features.calendar'),
        ];
    }

    private static function flag(string $key): bool
    {
        return filter_var(config($key, false), FILTER_VALIDATE_BOOLEAN);
    }
}

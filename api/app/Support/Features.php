<?php

namespace App\Support;

/**
 * The complete set of feature flags GET /api/v1/config exposes to the SPA.
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
 * JavaScript treats as truthy, permanently turning the flag on.
 * FILTER_VALIDATE_BOOLEAN's general rule is what makes this safe rather than
 * a fix for three memorised strings: without FILTER_NULL_ON_FAILURE it FAILS
 * CLOSED on any input it does not recognise as true ('false', '0', '', a
 * typo, an unexpected type — all read as false), so a value nobody
 * anticipated cannot silently turn a flag on. Only the literal truthy forms
 * ('true', '1', 'yes', 'on', and the boolean `true` itself) read as on.
 *
 * config/features.php now casts at the config layer too (matching
 * config/docs.php's API_DOCS_ENABLED, so a future direct
 * config('features.calendar') read is never left holding a raw string). The
 * cast below stays as well: ConfigEndpointTest deliberately stubs
 * config('features.calendar') with raw, environment-shaped strings to pin
 * this fail-closed behaviour without booting a real environment, which
 * bypasses config/features.php's own cast entirely. filter_var() is
 * idempotent on an already-boolean value — filter_var(true, ...) === true,
 * filter_var(false, ...) === false — so re-checking here is free and keeps
 * this method correct however config('features.calendar') got its value.
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

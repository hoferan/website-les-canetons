<?php

namespace App\Support;

/**
 * The complete set of feature flags GET /api/v1/config exposes to the SPA.
 *
 * The key set is fixed in code, not read from the environment, for the same
 * reason ConfigController never returns config() wholesale: this endpoint is
 * public, and the config it draws from also carries database and mail
 * secrets. Reading arbitrary FEATURE_* keys would publish a stray key on some
 * server's .env to the whole internet. Every flag is listed here once, by a
 * developer, as with App\Support\Permission.
 *
 * One flag for now: `calendar`, which gates the calendar view on the events
 * page.
 *
 * The boolean cast matters. .env values arrive as strings, and
 * config/features.php's env('FEATURE_CALENDAR', false) only converts the
 * literal, unquoted `true`/`false`; a quoted 'false' or '0' would otherwise
 * reach the SPA as a non-empty string, which JavaScript treats as truthy.
 * Without FILTER_NULL_ON_FAILURE, FILTER_VALIDATE_BOOLEAN fails closed on any
 * input it does not recognise as true, so a value nobody anticipated cannot
 * turn a flag on. Only 'true', '1', 'yes', 'on' and the boolean `true` read as
 * on.
 *
 * config/features.php casts too, like config/docs.php's API_DOCS_ENABLED. The
 * cast here stays because ConfigEndpointTest stubs config('features.calendar')
 * with raw, environment-shaped strings, which bypasses that file's cast.
 * filter_var() is idempotent on a boolean, so re-checking costs nothing.
 */
final class Features
{
    /**
     * Every flag this class can report, and the only place the key set is
     * written down.
     *
     * all() builds its result in a loop over this list instead of returning
     * an array literal. Scramble evaluates a returned literal and publishes its
     * keys, which would document `features` as an object with a required
     * `calendar` and nothing else, contradicting the endpoint's behaviour that
     * a flag the server says nothing about reads as false. Built in a loop,
     * Scramble sees the docblock's `array<string, bool>`: a map of flag name to
     * boolean whose membership is the server's business.
     *
     * @var list<string>
     */
    public const FLAGS = ['calendar'];

    /** @return array<string, bool> */
    public static function all(): array
    {
        $flags = [];

        foreach (self::FLAGS as $flag) {
            $flags[$flag] = self::flag('features.'.$flag);
        }

        return $flags;
    }

    private static function flag(string $key): bool
    {
        return filter_var(config($key, false), FILTER_VALIDATE_BOOLEAN);
    }
}

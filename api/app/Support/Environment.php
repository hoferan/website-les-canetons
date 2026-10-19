<?php

namespace App\Support;

/**
 * Which deployment a response came from.
 */
enum Environment: string
{
    // Only the docblock above is published: Scramble renders an enum's class
    // docblock as the schema description in api/openapi.json, so the
    // reasoning lives here. A reader of the contract has no APP_ENV to set.
    //
    // An enum, so GET /api/v1/config publishes `env` as a closed set; the SPA
    // switches its whole chrome on that field.
    //
    // The two vocabularies differ on purpose. Laravel uses `local` and
    // `production` by convention, and other code keys off that (Scramble's
    // RestrictedDocsAccess gates its docs UI on app()->environment('local')).
    // Servers set APP_ENV by hand to this project's vocabulary (dev/test/qa,
    // prod = no ribbon) on TEST/QA/PROD. So `local` (Docker dev) maps onto Dev
    // here; renaming APP_ENV instead would break the behaviour that depends on
    // the literal string `local`.
    case Dev = 'dev';
    case Test = 'test';
    case Qa = 'qa';
    case Prod = 'prod';

    /**
     * APP_ENV translated into this project's vocabulary.
     *
     * Anything not listed falls through to Prod, including Laravel's idiomatic
     * `production`. That default is a fail-safe: a missing or misspelled
     * APP_ENV must never paint a staging ribbon on the live site, or label the
     * live API as staging.
     */
    public static function current(): self
    {
        return match (strtolower(trim((string) config('app.env')))) {
            'local', 'dev' => self::Dev,
            'test' => self::Test,
            'qa' => self::Qa,
            default => self::Prod,
        };
    }

    /** The canonical token: dev | test | qa | prod. */
    public static function name(): string
    {
        return self::current()->value;
    }

    /**
     * Human-readable, for display next to a URL. English, like everything else
     * the API emits.
     *
     * ConfigController (the SPA's env ribbon) and DocsDocumentController (the
     * API reference's server label) share this one source, so they cannot
     * disagree about which environment this is.
     */
    public static function label(): string
    {
        return match (self::current()) {
            self::Dev => 'Local dev',
            self::Test => 'TEST environment',
            self::Qa => 'QA environment',
            self::Prod => 'Production',
        };
    }
}

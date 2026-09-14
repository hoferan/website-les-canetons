<?php

namespace App\Support;

/**
 * Which deployment a response came from.
 */
enum Environment: string
{
    // THE DOCBLOCK ABOVE IS PUBLISHED, and everything below it is not.
    // Scramble renders an enum's class docblock as the schema description in
    // api/openapi.json, so the reasoning lives here as a comment — a reader of
    // the contract has no APP_ENV to set and no ribbon to paint.
    //
    // THIS IS AN ENUM AS OF 2026-09-11, and was a final class with static
    // methods before that. The values were always a closed set of four; being a
    // class meant GET /api/v1/config published `env` as a bare `string`, so the
    // one field the SPA switches its whole chrome on had no closed set in the
    // contract. Every call site kept working: name() and label() are still
    // static and still return strings.
    //
    // THE TWO VOCABULARIES DIFFER FOR A REAL REASON, not by accident. Laravel
    // itself uses `local`/`production` by convention, and other code keys off
    // that — Scramble's RestrictedDocsAccess gates its docs UI on
    // app()->environment('local') — whereas this project's vocabulary
    // (dev/test/qa, prod = no ribbon) came from the old App\Env and is what
    // servers set APP_ENV to by hand on TEST/QA/PROD. So `local` (Docker dev)
    // maps onto Dev here rather than renaming APP_ENV to match; doing the
    // latter would break the Laravel-idiomatic behaviour that depends on the
    // literal string `local`.
    case Dev = 'dev';
    case Test = 'test';
    case Qa = 'qa';
    case Prod = 'prod';

    /**
     * APP_ENV translated into this project's vocabulary.
     *
     * Anything not listed — including Laravel's idiomatic `production`, listed
     * explicitly so a future edit to this map cannot silently break it — falls
     * through to Prod. That default is a fail-safe: a missing or misspelled
     * APP_ENV must never paint a staging ribbon on the live site, and must
     * never label the live API as staging either.
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
     * the API emits — the one French-only surface in this project is the SPA's
     * rendered UI, and neither consumer of this is that.
     *
     * Two consumers, deliberately sharing one source: ConfigController (the
     * SPA's env ribbon) and DocsDocumentController (the API reference's server
     * label). They disagreeing about what environment this is would be worse
     * than either being wrong alone.
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

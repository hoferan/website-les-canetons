<?php

namespace App\Support;

/**
 * The one place APP_ENV is translated into this project's own environment
 * vocabulary.
 *
 * The two vocabularies differ for a real reason, not by accident: Laravel
 * itself uses `local`/`production` by convention (and other code keys off
 * that — e.g. Scramble's RestrictedDocsAccess middleware gates its docs UI on
 * app()->environment('local')), whereas this project's vocabulary
 * (`dev`/`test`/`qa`, prod = no ribbon) came from the old App\Env and is what
 * servers set APP_ENV to by hand on TEST/QA/PROD. So `local` (Docker dev) maps
 * onto `dev` here rather than renaming APP_ENV to match — doing the latter
 * would break the Laravel-idiomatic behaviour that depends on the literal
 * string `local`.
 *
 * Anything not listed (including Laravel's idiomatic `production`, listed
 * explicitly so a future edit to this map cannot silently break it) falls
 * through to 'prod'. That default is a fail-safe: a missing or misspelled
 * APP_ENV must never paint a staging ribbon on the live site, and must never
 * label the live API as staging either.
 *
 * Two consumers, deliberately sharing one map: ConfigController (the SPA's env
 * ribbon) and DocsDocumentController (the API reference's server label). They
 * disagreeing about what environment this is would be worse than either being
 * wrong alone.
 */
final class Environment
{
    private const ENV_MAP = [
        'local' => 'dev',
        'dev' => 'dev',
        'test' => 'test',
        'qa' => 'qa',
        'production' => 'prod',
        'prod' => 'prod',
    ];

    /**
     * Human-readable, for display next to a URL. English, like everything else
     * the API emits — the one French-only surface in this project is the SPA's
     * rendered UI, and neither consumer of this is that.
     */
    private const LABELS = [
        'dev' => 'Local dev',
        'test' => 'TEST environment',
        'qa' => 'QA environment',
        'prod' => 'Production',
    ];

    /** The canonical token: dev | test | qa | prod. */
    public static function name(): string
    {
        $env = strtolower(trim((string) config('app.env')));

        return self::ENV_MAP[$env] ?? 'prod';
    }

    public static function label(): string
    {
        return self::LABELS[self::name()];
    }
}

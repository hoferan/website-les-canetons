<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

/**
 * Runtime configuration for the SPA.
 *
 * WHY THIS EXISTS. The front end is a static bundle promoted unchanged from TEST
 * to QA to PROD, so nothing environment-specific may be compiled into it —
 * baking values in at build time would mean one build per environment and would
 * break tag-based promotion. Everything the old app rendered from config.php
 * therefore arrives here at runtime.
 *
 * PUBLIC AND UNAUTHENTICATED, so every value below is an explicit, reviewed
 * choice. Never return config() wholesale: this response is world-readable and
 * the same config carries database and mail secrets.
 */
class ConfigController extends Controller
{
    /**
     * Translates Laravel's APP_ENV vocabulary into the ribbon vocabulary the
     * old App\Env (and this response) speaks.
     *
     * The two vocabularies differ for a real reason, not by accident: Laravel
     * itself uses `local`/`production` by convention (and other code keys off
     * that — e.g. Scramble's RestrictedDocsAccess middleware gates the API
     * docs UI on app()->environment('local')), whereas the ribbon vocabulary
     * (`dev`/`test`/`qa`, prod = no ribbon) came from the old App\Env and is
     * what servers set APP_ENV to by hand on TEST/QA/PROD. So `local` (Docker
     * dev) maps onto `dev` here rather than renaming APP_ENV to match — doing
     * the latter would break the Laravel-idiomatic behaviour that depends on
     * the literal string `local`.
     *
     * Anything not listed here (including Laravel's idiomatic `production`,
     * listed explicitly so a future edit to this map cannot silently break it)
     * falls through to the default branch below, which is 'prod'.
     */
    private const ENV_MAP = [
        'local' => 'dev',
        'dev' => 'dev',
        'test' => 'test',
        'qa' => 'qa',
        'production' => 'prod',
        'prod' => 'prod',
    ];

    public function __invoke(): JsonResponse
    {
        return response()->json([
            'env' => $this->env(),
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * Anything that is not a recognised entry in ENV_MAP collapses to 'prod',
     * copying App\Env's fail-safe: a missing or misspelled APP_ENV must never
     * paint a staging ribbon on the live site.
     */
    private function env(): string
    {
        $env = strtolower(trim((string) config('app.env')));

        return self::ENV_MAP[$env] ?? 'prod';
    }
}

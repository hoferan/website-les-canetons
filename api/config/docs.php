<?php

/**
 * The API reference at /api/docs.
 *
 * On by default. Hiding the reference would be security through obscurity:
 * web/src/api/generated/endpoints.ts ships in the SPA bundle every visitor
 * downloads, with every path, method and type. What protects the API is
 * auth:sanctum and the permission middleware, and documenting them weakens
 * neither.
 *
 * The risk is the console. resources/views/docs.blade.php primes the CSRF
 * cookie so "Send" works on mutating endpoints, which on production puts a
 * logged-in reader one click from DELETE /api/v1/events/{event} against real
 * data. So the console is gated separately, below.
 *
 * filter_var, not a bare env() read: a dotenv value is a string, so "false"
 * would be truthy (config/session.php wraps SESSION_SECURE_COOKIE for the
 * same reason).
 *
 * Read through config() at the point of use, never env(), so `config:cache` on
 * a server cannot leave a stale value behind.
 */
return [
    'enabled' => filter_var(env('API_DOCS_ENABLED', true), FILTER_VALIDATE_BOOLEAN),

    /**
     * Whether the reference may fire requests, as opposed to describe them.
     *
     * Off in production, on everywhere else. The default comes from APP_ENV,
     * so a server without API_DOCS_INTERACTIVE gets the safe answer; setting
     * the key overrides it.
     *
     * env('APP_ENV') rather than app()->environment(): a config file loads
     * before the container has an `env` binding, so the helper fails with
     * "Target class [env] does not exist" while booting, and takes every route
     * down with it. Nothing in a config file may touch the container.
     *
     * An unset APP_ENV reads as production and turns the console off, the same
     * fail-safe direction App\Support\Environment takes for the staging ribbon.
     */
    'interactive' => filter_var(
        env('API_DOCS_INTERACTIVE', env('APP_ENV', 'production') !== 'production'),
        FILTER_VALIDATE_BOOLEAN,
    ),

    /**
     * The OpenAPI document to serve.
     *
     * base_path() resolves inside the Laravel project directory, where
     * `npm run openapi` writes it. config/scramble.php's export_path is a bare
     * 'openapi.json', resolved against the exporting process's working
     * directory, which is why tools/openapi.mjs runs from there. The file is
     * committed and travels in the deploy artifact.
     *
     * Configurable so a test can point at a missing file and assert the 404.
     */
    'document' => base_path('openapi.json'),
];

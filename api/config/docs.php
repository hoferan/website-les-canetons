<?php

/**
 * The API reference at /api/docs.
 *
 * DEFAULTS TO TRUE as of 2026-09-11, reversing the previous default, and the
 * reasoning behind that reversal is worth keeping.
 *
 * The old default was off, on the grounds that exposing the API surface was
 * itself a risk. It is not, and treating it as one was security through
 * obscurity: web/src/api/generated/endpoints.ts ships inside the SPA bundle
 * that every visitor downloads, carrying every path, method and type in a more
 * machine-readable form than this page does. Anyone with devtools has the whole
 * surface in under a minute. What actually protects this API is auth:sanctum
 * and the permission middleware, server-side, and none of that is weakened by
 * documenting it. A public API with a hidden reference is close to a
 * contradiction.
 *
 * WHAT WAS REAL ABOUT THE OLD RESTRICTION IS THE CONSOLE, not the content.
 * resources/views/docs.blade.php primes the CSRF cookie so that "Send" works
 * on mutating endpoints — deliberately, because a reference you cannot try is
 * half a reference. On production that means somebody reading the docs while
 * logged in is one click from DELETE /api/v1/events/{event} against real data.
 * Not a vulnerability, since they hold the permission and could use curl — but
 * a documentation page that destroys live records by accident is exactly the
 * kind of footgun that goes off. So the console is gated separately, below.
 *
 * filter_var, not a bare env() read: a dotenv value is a STRING, so "false"
 * would be truthy. The same reason config/session.php wraps
 * SESSION_SECURE_COOKIE.
 *
 * Read through config() at the point of use, never env(), so `config:cache` on
 * a server cannot leave a stale value behind.
 */
return [
    'enabled' => filter_var(env('API_DOCS_ENABLED', true), FILTER_VALIDATE_BOOLEAN),

    /**
     * Whether the reference may FIRE requests, as opposed to describe them.
     *
     * Off in production and on everywhere else, which is where you actually
     * want to poke at an endpoint anyway — a local stack or a staging server
     * whose data nobody minds you breaking.
     *
     * Defaults from the environment rather than from a key somebody has to
     * remember to set: a server that has never heard of API_DOCS_INTERACTIVE
     * lands on the safe answer for what it is. Setting it explicitly overrides
     * that, which is the escape hatch for anyone who wants the console on a
     * production reference and has read the paragraph above.
     *
     * env('APP_ENV') rather than app()->environment(). A config file is loaded
     * BEFORE the container has an `env` binding, so calling the helper here
     * fails with "Target class [env] does not exist" — and it fails while
     * booting, which means every route, including the ones that would tell you
     * why. Nothing in a config file may touch the container.
     *
     * An unset or unrecognised APP_ENV therefore reads as production and turns
     * the console OFF, which is the same fail-safe direction App\Support\
     * Environment takes for the staging ribbon.
     */
    'interactive' => filter_var(
        env('API_DOCS_INTERACTIVE', env('APP_ENV', 'production') !== 'production'),
        FILTER_VALIDATE_BOOLEAN,
    ),

    /**
     * The OpenAPI document to serve.
     *
     * base_path() resolves inside the Laravel project directory, where
     * `npm run openapi` writes it (config/scramble.php's export_path is a bare
     * 'openapi.json', resolved against the exporting process's working
     * directory — see tools/openapi.mjs, which cd's there for exactly this
     * reason). It is committed and travels in the deploy artifact.
     *
     * Configurable so a test can point at a missing file and assert the 404.
     */
    'document' => base_path('openapi.json'),
];

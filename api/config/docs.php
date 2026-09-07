<?php

/**
 * The API reference at /api/docs.
 *
 * DEFAULTS TO FALSE, and that default is the security control. An interactive
 * console over the whole API surface belongs on a developer's machine and on
 * the Basic-Auth'd staging environments, not on the public site — and a server
 * provisioned before this key existed, or one whose .env sets it to nothing,
 * must land on "off" rather than "on".
 *
 * filter_var, not a bare env() read: a dotenv value is a STRING, so "false"
 * would be truthy. The same reason config/session.php wraps
 * SESSION_SECURE_COOKIE.
 *
 * Read through config() at the point of use, never env(), so `config:cache` on
 * a server cannot leave a stale value behind.
 */
return [
    'enabled' => filter_var(env('API_DOCS_ENABLED', false), FILTER_VALIDATE_BOOLEAN),

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

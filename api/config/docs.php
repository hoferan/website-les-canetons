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
];

<?php

// Single entry point for shared logic. The front controller requires this once.

require __DIR__ . '/../vendor/autoload.php';

use App\Auth;
use App\AutoMigrator;
use App\Database;
use App\Env;
use App\Features;

$config = require __DIR__ . '/../config.php';
// Record the deployment environment (dev/test/qa/prod) for the env ribbon.
// Absent/unknown collapses to prod (no ribbon) — see App\Env.
Env::init($config['env'] ?? null);
// On non-prod (test/qa/dev), route PHP errors and explicit error_log() calls
// (e.g. the fail-safe signup-mail catch in api/signups.php) to a file at the
// site root, so failures are retrievable over FTP on the shared host. The log
// is not web-readable: the front controller rewrites every non-/assets/ request
// to index.php, so a direct hit on /php-error.log 404s. PROD keeps the host's
// default logging untouched.
if (!Env::isProd()) {
    ini_set('log_errors', '1');
    ini_set('error_log', dirname(__DIR__) . '/php-error.log');
}
// Server-owned, hand-set per environment — see App\Features.
Features::init($config['features'] ?? []);
Database::connect($config['db']);
// Apply pending migrations server-side on the first request after a deploy
// (single-flight via GET_LOCK). The CI runner can't reach the host to trigger
// /api/migrate, so migrations self-apply here. Fail-loud: a migration error
// serves 503 rather than a page against a half-migrated schema.
if ($config['auto_migrate'] ?? true) {
    try {
        (new AutoMigrator(Database::get(), dirname(__DIR__) . '/sql/migrations'))
            ->maybeMigrate();
    } catch (\Throwable $e) {
        error_log('Auto-migration failed: ' . $e->getMessage());
        http_response_code(503);
        header('Retry-After: 30');
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><title>Maintenance</title>'
            . '<p>Site en maintenance, merci de réessayer dans un instant.</p>';
        exit;
    }
}
// Start the session up front (before any page output) so the authenticated
// role can be read safely everywhere — including public pages whose head.php
// injects it for the UI. Idempotent: guards/login/logout re-call it harmlessly.
Auth::startSession();

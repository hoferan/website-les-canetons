<?php

// Token-gated server-side migration endpoint. Runs sql/migrations/*.sql via
// App\Migrator using config.php's localhost DB connection. Triggered over HTTPS
// by tools/dbmigrate.mjs as a post-deploy step. Not session-authenticated:
// gated by a secret token (config migrate.token), compared in constant time.
// Disabled (404) when no token is configured, so an unconfigured server is inert.

use App\Database;
use App\Env;
use App\Migrator;

header('Content-Type: application/json');

$config = require __DIR__ . '/../config.php';
$expected = (string) ($config['migrate']['token'] ?? '');

// No token configured -> endpoint does not exist here.
if ($expected === '') {
    http_response_code(404);
    require __DIR__ . '/../pages/404.php';
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$supplied = (string) ($_SERVER['HTTP_X_MIGRATE_TOKEN'] ?? '');
if (!hash_equals($expected, $supplied)) {
    http_response_code(401);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

$mode = ($_GET['mode'] ?? 'dry-run') === 'apply' ? 'apply' : 'dry-run';
$dir = __DIR__ . '/../sql/migrations';
$migrator = new Migrator(Database::get());

try {
    if ($mode === 'apply') {
        $applied = $migrator->migrate($dir);
        $pending = [];
    } else {
        $applied = [];
        $pending = $migrator->pending($dir);
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status'      => 'error',
        'mode'        => $mode,
        'environment' => Env::current(),
        'error'       => $e->getMessage(),
    ]);
    exit;
}

echo json_encode([
    'status'      => 'ok',
    'mode'        => $mode,
    'environment' => Env::current(),
    'applied'     => $applied,
    'pending'     => $pending,
]);

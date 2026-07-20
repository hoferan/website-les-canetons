<?php

// Dev/CI CLI migration runner (docker `migrate` service + local dev). Applies
// sql/migrations/NNN_*.sql via App\Migrator, connecting with DB_* env vars.
// Production/staging migrate server-side over HTTP via app/api/migrate.php;
// this CLI path is for the docker-compose `migrate` service and local runs.
// Idempotent. All migration logic lives in App\Migrator (single source).

require __DIR__ . '/../app/src/Migrator.php';

use App\Migrator;

$dir  = $argv[1] ?? (__DIR__ . '/../sql/migrations');
$host = getenv('DB_HOST') ?: 'db';
$user = getenv('DB_USER') ?: 'root';
$pass = getenv('DB_PASS') ?: 'root';
$name = getenv('DB_NAME') ?: 'lescanetons';

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

$attempts = 0;
$maxAttempts = 30; // ~30s at 1s/attempt, generous for a cold MariaDB init
while (true) {
    try {
        $db = new mysqli($host, $user, $pass, $name);
        break;
    } catch (mysqli_sql_exception $e) {
        if (++$attempts >= $maxAttempts) {
            fwrite(STDERR, "Could not connect to DB after {$maxAttempts} attempts: {$e->getMessage()}\n");
            exit(1);
        }
        sleep(1);
    }
}
$db->set_charset('utf8mb4');

try {
    $ran = (new Migrator($db))->migrate($dir);
} catch (RuntimeException $e) {
    fwrite(STDERR, $e->getMessage() . "\n");
    exit(1);
}

echo 'Migrations up to date (' . count($ran) . " applied this run).\n";

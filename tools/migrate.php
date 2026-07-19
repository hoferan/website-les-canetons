<?php

// Dev-only migration runner (never deployed). Applies sql/migrations/NNN_*.sql
// once each, tracked in schema_migrations. Idempotent: safe to run on every
// `docker compose up`. Production migrations are still applied manually.

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

$db->query(
    'CREATE TABLE IF NOT EXISTS schema_migrations ('
    . 'version VARCHAR(255) NOT NULL PRIMARY KEY, '
    . 'applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
    . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$applied = [];
$res = $db->query('SELECT version FROM schema_migrations');
while ($row = $res->fetch_assoc()) {
    $applied[$row['version']] = true;
}

$files = glob(rtrim($dir, '/') . '/[0-9]*.sql');
sort($files, SORT_STRING);

$ran = 0;
foreach ($files as $file) {
    $version = basename($file);
    if (isset($applied[$version])) {
        continue;
    }
    echo "Applying {$version} ...\n";
    $sql = file_get_contents($file);
    try {
        $db->multi_query($sql);
        do {
            if ($result = $db->store_result()) {
                $result->free();
            }
        } while ($db->more_results() && $db->next_result());
    } catch (mysqli_sql_exception $e) {
        fwrite(STDERR, "Migration {$version} failed: {$e->getMessage()}\n");
        exit(1);
    }
    $stmt = $db->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
    $stmt->bind_param('s', $version);
    $stmt->execute();
    $stmt->close();
    $ran++;
}

echo "Migrations up to date ({$ran} applied this run).\n";

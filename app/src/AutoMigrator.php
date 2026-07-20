<?php

namespace App;

use mysqli;
use RuntimeException;

/**
 * Applies pending migrations server-side on the first request after a deploy,
 * guarded by a MySQL advisory lock so concurrent PHP-FPM workers can't
 * double-apply or race. Hooked from bootstrap.php; reuses App\Migrator.
 *
 * Why request-path: the CI runner cannot reach the host to trigger
 * /api/migrate (the host firewalls the runner IP). Running here — where the DB
 * connection is local — needs no inbound connection and applies the schema
 * before the request that depends on it is served.
 */
final class AutoMigrator
{
    private const LOCK_NAME = 'lescanetons_migrate';
    private const LOCK_TIMEOUT_SECONDS = 30;

    public function __construct(
        private mysqli $db,
        private string $migrationsDir
    ) {
    }

    public function maybeMigrate(): void
    {
        $migrator = new Migrator($this->db);

        // Hot path: nothing pending -> no lock, no work. (nearly every request)
        if ($migrator->pending($this->migrationsDir) === []) {
            return;
        }

        if (!$this->acquireLock()) {
            // 0 = timed out waiting for an in-progress migration, NULL = error.
            throw new RuntimeException('Could not acquire migration lock');
        }
        try {
            // Re-check under the lock: a concurrent worker may have just finished.
            if ($migrator->pending($this->migrationsDir) !== []) {
                $migrator->migrate($this->migrationsDir);
            }
        } finally {
            $this->releaseLock();
        }
    }

    private function acquireLock(): bool
    {
        $res = $this->db->query(
            sprintf("SELECT GET_LOCK('%s', %d)", self::LOCK_NAME, self::LOCK_TIMEOUT_SECONDS)
        );
        $row = $res->fetch_row();
        $res->free();

        return isset($row[0]) && (string) $row[0] === '1';
    }

    private function releaseLock(): void
    {
        $res = $this->db->query(sprintf("SELECT RELEASE_LOCK('%s')", self::LOCK_NAME));
        if ($res instanceof \mysqli_result) {
            $res->free();
        }
    }
}

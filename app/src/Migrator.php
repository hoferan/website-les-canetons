<?php

namespace App;

use mysqli;
use mysqli_sql_exception;
use RuntimeException;

/**
 * Applies numbered SQL migrations (sql/migrations/NNN_*.sql) idempotently,
 * tracked in a schema_migrations table. Single source of migration logic,
 * shared by the CLI runner (tools/migrate.php, dev/docker) and the HTTP
 * endpoint (app/api/migrate.php, server-side deploys).
 *
 * DDL note: MariaDB implicitly commits on CREATE/ALTER/DROP, so schema changes
 * are NOT rolled back by the per-migration transaction below. That transaction
 * makes DML and the schema_migrations bookkeeping atomic and stops the run on
 * the first failure. Migrations must be authored idempotently and
 * backward-compatibly — see sql/migrations/README.md.
 */
final class Migrator
{
    public function __construct(private mysqli $db)
    {
    }

    /** Migration files in ascending order. */
    private function files(string $dir): array
    {
        $files = glob(rtrim($dir, '/') . '/[0-9]*.sql') ?: [];
        sort($files, SORT_STRING);
        return $files;
    }

    private function schemaTableExists(): bool
    {
        $res = $this->db->query("SHOW TABLES LIKE 'schema_migrations'");
        $exists = $res->num_rows > 0;
        $res->free();
        return $exists;
    }

    /** Versions already recorded as applied (empty when the table is absent). */
    private function appliedVersions(): array
    {
        if (!$this->schemaTableExists()) {
            return [];
        }
        $applied = [];
        $res = $this->db->query('SELECT version FROM schema_migrations');
        while ($row = $res->fetch_assoc()) {
            $applied[$row['version']] = true;
        }
        $res->free();
        return $applied;
    }

    /**
     * Pending migration versions (filenames) in ascending order, WITHOUT
     * applying them or creating any table. Read-only — safe for dry-run.
     *
     * @return string[]
     */
    public function pending(string $dir): array
    {
        $applied = $this->appliedVersions();
        $pending = [];
        foreach ($this->files($dir) as $file) {
            $version = basename($file);
            if (!isset($applied[$version])) {
                $pending[] = $version;
            }
        }
        return $pending;
    }

    private function ensureSchemaTable(): void
    {
        $this->db->query(
            'CREATE TABLE IF NOT EXISTS schema_migrations ('
            . 'version VARCHAR(255) NOT NULL PRIMARY KEY, '
            . 'applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP'
            . ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        );
    }

    /**
     * Applies every pending migration in ascending order, each in its own
     * transaction, recording it in schema_migrations. Stops and throws on the
     * first failure. Idempotent: already-applied files are skipped.
     *
     * @return string[] versions applied this run
     */
    public function migrate(string $dir): array
    {
        $this->ensureSchemaTable();
        $applied = $this->appliedVersions();
        $ran = [];
        foreach ($this->files($dir) as $file) {
            $version = basename($file);
            if (isset($applied[$version])) {
                continue;
            }
            $sql = (string) file_get_contents($file);
            $this->db->begin_transaction();
            try {
                $this->db->multi_query($sql);
                do {
                    if ($result = $this->db->store_result()) {
                        $result->free();
                    }
                } while ($this->db->more_results() && $this->db->next_result());
                $stmt = $this->db->prepare('INSERT INTO schema_migrations (version) VALUES (?)');
                $stmt->bind_param('s', $version);
                $stmt->execute();
                $stmt->close();
                $this->db->commit();
            } catch (mysqli_sql_exception $e) {
                $this->db->rollback();
                throw new RuntimeException("Migration {$version} failed: {$e->getMessage()}", 0, $e);
            }
            $ran[] = $version;
        }
        return $ran;
    }
}

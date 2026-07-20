<?php

use App\AutoMigrator;
use App\Migrator;

/**
 * AutoMigrator does DDL (via Migrator), which MariaDB implicitly commits — so it
 * escapes IntegrationTestCase's transaction rollback. Like MigratorTest, this
 * test cleans up its own artifacts (its temp table + schema_migrations row).
 */
final class AutoMigratorTest extends IntegrationTestCase
{
    private string $dir;
    private string $version = '950_automigrator_test.sql';

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/automigrator_test_' . uniqid();
        mkdir($this->dir);
        file_put_contents(
            $this->dir . '/' . $this->version,
            'CREATE TABLE IF NOT EXISTS automigrator_test (id INT PRIMARY KEY) '
            . 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
        );
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        $this->cleanup();
        array_map('unlink', glob($this->dir . '/*'));
        rmdir($this->dir);
        parent::tearDown();
    }

    private function cleanup(): void
    {
        $this->db->query('DROP TABLE IF EXISTS automigrator_test');
        $res = $this->db->query("SHOW TABLES LIKE 'schema_migrations'");
        $exists = $res->num_rows > 0;
        $res->free();
        if ($exists) {
            $stmt = $this->db->prepare('DELETE FROM schema_migrations WHERE version = ?');
            $stmt->bind_param('s', $this->version);
            $stmt->execute();
            $stmt->close();
        }
    }

    public function testMaybeMigrateAppliesPendingAndRecordsIt(): void
    {
        (new AutoMigrator($this->db, $this->dir))->maybeMigrate();

        $res = $this->db->query("SHOW TABLES LIKE 'automigrator_test'");
        $created = $res->num_rows > 0;
        $res->free();
        $this->assertTrue($created, 'the pending migration should have run');
        $this->assertSame([], (new Migrator($this->db))->pending($this->dir));
    }

    public function testMaybeMigrateIsNoOpWhenNothingPending(): void
    {
        $auto = new AutoMigrator($this->db, $this->dir);
        $auto->maybeMigrate(); // applies
        $auto->maybeMigrate(); // nothing pending — must not throw or re-apply
        $this->assertSame([], (new Migrator($this->db))->pending($this->dir));
    }
}

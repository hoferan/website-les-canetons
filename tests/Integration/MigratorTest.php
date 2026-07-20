<?php

use App\Migrator;

/**
 * Migrations do DDL, which MariaDB implicitly commits — so it escapes
 * IntegrationTestCase's transaction rollback. This test therefore cleans up its
 * own artifacts (the test table + its schema_migrations rows) explicitly.
 */
final class MigratorTest extends IntegrationTestCase
{
    private string $dir;

    /** @var string[] */
    private array $versions = ['900_migrator_test_create.sql', '901_migrator_test_seed.sql'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir() . '/migrator_test_' . uniqid();
        mkdir($this->dir);
        file_put_contents(
            $this->dir . '/900_migrator_test_create.sql',
            'CREATE TABLE IF NOT EXISTS migrator_test (id INT PRIMARY KEY, label VARCHAR(50)) '
            . 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
        );
        file_put_contents(
            $this->dir . '/901_migrator_test_seed.sql',
            "INSERT INTO migrator_test (id, label) VALUES (1, 'a');"
        );
        $this->cleanupArtifacts();
    }

    protected function tearDown(): void
    {
        $this->cleanupArtifacts();
        array_map('unlink', glob($this->dir . '/*'));
        rmdir($this->dir);
        parent::tearDown();
    }

    private function cleanupArtifacts(): void
    {
        $this->db->query('DROP TABLE IF EXISTS migrator_test');
        $res = $this->db->query("SHOW TABLES LIKE 'schema_migrations'");
        $exists = $res->num_rows > 0;
        $res->free();
        if ($exists) {
            $in = "'" . implode("','", $this->versions) . "'";
            $this->db->query("DELETE FROM schema_migrations WHERE version IN ($in)");
        }
    }

    public function testPendingListsUnappliedFilesInOrder(): void
    {
        $pending = (new Migrator($this->db))->pending($this->dir);
        $this->assertSame($this->versions, $pending);
    }

    public function testMigrateAppliesRecordsAndReturnsVersions(): void
    {
        $migrator = new Migrator($this->db);
        $applied = $migrator->migrate($this->dir);

        $this->assertSame($this->versions, $applied);
        // Table + row exist.
        $row = $this->db->query('SELECT label FROM migrator_test WHERE id = 1')->fetch_assoc();
        $this->assertSame('a', $row['label']);
        // Nothing pending now.
        $this->assertSame([], $migrator->pending($this->dir));
    }

    public function testMigrateIsIdempotentOnRerun(): void
    {
        $migrator = new Migrator($this->db);
        $migrator->migrate($this->dir);
        $this->assertSame([], $migrator->migrate($this->dir));
    }

    public function testFailingMigrationThrowsAndIsNotRecorded(): void
    {
        file_put_contents($this->dir . '/902_migrator_test_bad.sql', 'THIS IS NOT SQL;');
        $this->versions[] = '902_migrator_test_bad.sql';
        $migrator = new Migrator($this->db);

        try {
            $migrator->migrate($this->dir);
            $this->fail('Expected a RuntimeException');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('902_migrator_test_bad.sql', $e->getMessage());
        }
        // The bad migration is not recorded, so it is still pending.
        $this->assertContains('902_migrator_test_bad.sql', $migrator->pending($this->dir));
    }

    public function testPendingOrdersFilesNaturallyAcrossDigitWidths(): void
    {
        // Same directory as setUp's 900/901 fixtures, plus an out-of-width one:
        // lexicographic (SORT_STRING) would sort '1000_...' before '900_...'
        // because '1' < '9' as the first character.
        file_put_contents($this->dir . '/1000_migrator_test_late.sql', 'SELECT 1;');
        $this->versions[] = '1000_migrator_test_late.sql';

        $pending = (new Migrator($this->db))->pending($this->dir);

        // Natural order: 900, 901, 1000 — not lexicographic (which would put
        // '1000_...' before '900_...' since '1' < '9' as the first character).
        $this->assertSame(
            ['900_migrator_test_create.sql', '901_migrator_test_seed.sql', '1000_migrator_test_late.sql'],
            $pending
        );
    }
}

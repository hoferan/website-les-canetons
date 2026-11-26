<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Every migration must survive being run again (ADR 0008).
 *
 * They run on the first request after a deploy, where a worker can be killed
 * part way through a file. MariaDB has already committed each DDL statement
 * by then, so the retry meets what the first attempt left behind, and a file
 * that cannot run again answers 503 on every request until somebody repairs
 * the database by hand.
 *
 * This re-runs each file against the schema the suite has already migrated.
 * It cannot prove a file repairs a half-finished run, which needs a test of
 * its own (AttendanceSchemaTest, ImageSchemaTest), but it catches the file
 * that fails outright, and it covers every file, including the ones no other
 * test names.
 */
class MigrationsRunAgainTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function migrationFiles(): array
    {
        // A data provider runs before the application boots, so there is no
        // database_path() yet.
        $files = glob(dirname(__DIR__, 2).'/database/migrations/*.php') ?: [];

        $cases = [];
        foreach ($files as $file) {
            $cases[basename($file, '.php')] = [$file];
        }

        return $cases;
    }

    public function test_it_finds_the_migrations(): void
    {
        // Without this an empty glob would pass every case below by having none.
        $this->assertGreaterThan(50, count(self::migrationFiles()));
    }

    #[DataProvider('migrationFiles')]
    public function test_a_migration_runs_again_on_the_schema_it_helped_build(string $file): void
    {
        $migration = require $file;

        $migration->up();

        // Getting here without an exception is the assertion.
        $this->addToAssertionCount(1);
    }
}

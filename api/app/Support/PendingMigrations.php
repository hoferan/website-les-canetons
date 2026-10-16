<?php

namespace App\Support;

use Illuminate\Database\Migrations\Migrator;

/**
 * The migrations that exist as files but are absent from the migrations
 * table, by name, in the order `migrate` would run them.
 *
 * Read by POST /api/migrate for its `pending[]` and by GET /api/health. The
 * paths are assembled the way BaseCommand::getMigrationPaths() does, so this
 * list cannot disagree with what `artisan migrate` would pick up, including
 * any path a service provider registered.
 *
 * App\Http\Middleware\RunPendingMigrations asks only whether the list is
 * empty, on every request, and keeps its own cheaper check; see its comment.
 */
final class PendingMigrations
{
    /**
     * @return list<string>
     */
    public static function names(): array
    {
        /** @var Migrator $migrator */
        $migrator = app('migrator');

        $files = $migrator->getMigrationFiles(
            array_merge($migrator->paths(), [database_path('migrations')])
        );

        // On a database that has never been migrated the ledger does not exist
        // yet, so every migration is pending. Asking the repository would throw.
        $ran = $migrator->repositoryExists() ? $migrator->getRepository()->getRan() : [];

        return array_values(array_diff(array_keys($files), $ran));
    }
}

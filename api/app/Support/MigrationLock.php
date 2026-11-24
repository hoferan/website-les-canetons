<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Throwable;
use UnexpectedValueException;

/**
 * The MySQL advisory lock around every migration run, so two of them cannot
 * apply the same migration at once (ADR 0008). Both runners take it:
 * App\Http\Middleware\RunPendingMigrations on the first request after a
 * deploy, and POST /api/migrate in mode=apply.
 *
 * Why a raw GET_LOCK: Cache::lock() and `artisan migrate --isolated` both go
 * through the cache store, which is the `database` store
 * (CACHE_STORE=database, see api/.env.example), and the `cache` table is itself
 * created by a migration. GET_LOCK needs no table, so it works on an empty
 * database.
 *
 * The lock belongs to the connection that took it, so every statement here is
 * pinned to the write PDO (useReadPdo: false), the one `artisan migrate` writes
 * through.
 */
final class MigrationLock
{
    /**
     * The same name as the old server-rendered site's migrator, so the two
     * exclude each other while both can run against one database. Advisory
     * lock names are server-wide, not per-database.
     */
    public const NAME = 'lescanetons_migrate';

    /**
     * Long enough for a realistic migration run to finish while a second
     * runner waits, short enough that a wedged migration surfaces as an error
     * rather than pinning an FPM worker until the request times out.
     */
    public const TIMEOUT_SECONDS = 30;

    /**
     * GET_LOCK returns 1 (acquired), 0 (timed out) or NULL (error). Only 1 may
     * be read as success; the string comparison is because the driver hands
     * these back as strings on MariaDB.
     */
    public static function acquire(int $timeoutSeconds): bool
    {
        $row = DB::selectOne(
            'SELECT GET_LOCK(?, ?) AS acquired',
            [self::NAME, $timeoutSeconds],
            useReadPdo: false
        );

        if ($row === null) {
            // GET_LOCK always returns a row, so no row means something other
            // than MariaDB answered. A programming error, not a lock timeout.
            throw new UnexpectedValueException('GET_LOCK returned no row; the connection is not MariaDB/MySQL.');
        }

        return (string) $row->acquired === '1';
    }

    /**
     * Best-effort: the lock is released anyway when the connection closes at
     * the end of the request. Callers release in a finally{}, where throwing
     * would replace the real exception (a failed migration) with this one.
     */
    public static function release(): void
    {
        try {
            DB::selectOne('SELECT RELEASE_LOCK(?)', [self::NAME], useReadPdo: false);
        } catch (Throwable) {
            // Intentionally ignored; see the docblock.
        }
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Dedoc\Scramble\Attributes\ExcludeRouteFromDocs;
use Illuminate\Database\Migrations\Migrator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Throwable;

/**
 * The token-gated post-deploy migration endpoint.
 *
 * ITS CONTRACT IS NOT ITS OWN. tools/dbmigrate.mjs is the sole caller,
 * `npm run dbmigrate:<env>` wraps it, CI runs it as a step after every deploy,
 * and the operator checklist in staging/README.md documents it. All of that was
 * written against the old app/api/migrate.php, so this controller conforms to
 * that endpoint rather than the reverse. Concretely, the caller:
 *
 *  - sends the secret in the X-Migrate-Token HEADER (see __invoke),
 *  - appends `?mode=dry-run` or `?mode=apply`,
 *  - treats a non-2xx response OR a `status` other than 'ok' as failure and
 *    exits non-zero (which is what gates the CI step),
 *  - prints `pending[]` after a dry run and `applied[]` after an apply, both as
 *    arrays of migration NAMES,
 *  - and ignores every other key.
 *
 * `ok` is a boolean mirror of `status` kept for tools/smoke-docker.mjs, which
 * asserts {ok: true} plus a string `output` to prove the local stack dispatched
 * /api/migrate into Laravel at all.
 */
class MigrateController extends Controller
{
    /**
     * The shared secret arrives in the X-Migrate-Token HEADER, not as a request
     * parameter. Two reasons, either sufficient:
     *
     *  - It is the contract everything outside this app already speaks.
     *    tools/dbmigrate.mjs sends that header (as the old app's
     *    app/api/migrate.php read it), and every environment's CI secrets feed
     *    it. Reading a parameter here would 403 every `npm run dbmigrate:<env>`
     *    the moment /api/migrate starts reaching Laravel.
     *  - $request->input() also accepts the token from the QUERY STRING, and
     *    Apache writes the query string into its access log on every
     *    environment — so ?token=… would persist the secret to disk in
     *    plain text. A header cannot leak that way.
     */
    // Excluded from the OpenAPI document: this is deploy tooling called server-side
    // by tools/dbmigrate.mjs with a shared secret. The generated TypeScript client
    // is for the browser, and nothing in the browser may trigger a migration.
    // Do not re-add this to the documentation — it is intentionally hidden.
    #[ExcludeRouteFromDocs]
    public function __invoke(Request $request): JsonResponse
    {
        $expectedToken = config('app.migrate_token');
        $providedToken = $request->header('X-Migrate-Token');

        if (! $expectedToken || ! $providedToken || ! hash_equals($expectedToken, (string) $providedToken)) {
            return response()->json(['error' => 'Invalid or missing token'], 403);
        }

        // Anything that is not exactly 'apply' means dry-run — the same
        // fail-safe direction app/api/migrate.php chose. A missing, misspelled or
        // truncated mode must never be the one that writes to the database.
        $mode = $request->query('mode') === 'apply' ? 'apply' : 'dry-run';

        try {
            return $mode === 'apply' ? $this->apply() : $this->dryRun();
        } catch (Throwable $e) {
            // Non-2xx AND status 'error': the caller accepts either as failure,
            // and a migration that fails while reporting success would let a
            // broken deploy through the CI gate.
            return $this->respond($mode, 500, [
                'status' => 'error',
                'ok' => false,
                'error' => $e->getMessage(),
                'applied' => [],
                'pending' => [],
                'output' => Artisan::output(),
            ]);
        }
    }

    /**
     * Report what WOULD run, touching neither the schema nor the migrations
     * table.
     *
     * This reads the pending list rather than shelling out to `migrate
     * --pretend`: the caller wants migration NAMES, which is exactly what the
     * pending list is, whereas --pretend emits the SQL it would have issued and
     * would still boot every pending migration class to get there. Not running
     * the migrations at all is a stronger guarantee than running them in a mode
     * that promises not to write.
     */
    private function dryRun(): JsonResponse
    {
        return $this->respond('dry-run', 200, [
            'status' => 'ok',
            'ok' => true,
            'applied' => [],
            'pending' => $this->pendingMigrations(),
            // Always a string, never absent: smoke-docker.mjs type-checks it.
            'output' => '',
        ]);
    }

    private function apply(): JsonResponse
    {
        // Snapshot first: `migrate` prints its progress but does not return the
        // names, and diffing the pending list across the run is what turns that
        // into applied[] without parsing console output.
        $pendingBefore = $this->pendingMigrations();

        $exitCode = Artisan::call('migrate', ['--force' => true]);
        $output = Artisan::output();

        $pendingAfter = $this->pendingMigrations();

        // A throwing migration lands in __invoke's catch; a command that merely
        // exits non-zero would otherwise be reported as a success.
        if ($exitCode !== 0) {
            return $this->respond('apply', 500, [
                'status' => 'error',
                'ok' => false,
                'error' => "artisan migrate exited with code {$exitCode}",
                'applied' => array_values(array_diff($pendingBefore, $pendingAfter)),
                'pending' => $pendingAfter,
                'output' => $output,
            ]);
        }

        return $this->respond('apply', 200, [
            'status' => 'ok',
            'ok' => true,
            'applied' => array_values(array_diff($pendingBefore, $pendingAfter)),
            'pending' => $pendingAfter,
            'output' => $output,
        ]);
    }

    /**
     * The migrations that exist as files but are absent from the migrations
     * table, by name, in the order `migrate` would run them.
     *
     * The paths are assembled the way BaseCommand::getMigrationPaths() does, so
     * this list cannot disagree with what `artisan migrate` would pick up —
     * including any path a service provider registered.
     *
     * @return list<string>
     */
    private function pendingMigrations(): array
    {
        /** @var Migrator $migrator */
        $migrator = app('migrator');

        $files = $migrator->getMigrationFiles(
            array_merge($migrator->paths(), [database_path('migrations')])
        );

        // On a database that has never been migrated the ledger does not exist
        // yet, so every migration is pending — asking the repository would throw.
        $ran = $migrator->repositoryExists() ? $migrator->getRepository()->getRan() : [];

        return array_values(array_diff(array_keys($files), $ran));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function respond(string $mode, int $status, array $payload): JsonResponse
    {
        return response()->json([
            'mode' => $mode,
            // Informational, as in the old endpoint (which reported App\Env);
            // the caller logs the body verbatim, so this tells an operator which
            // server answered.
            'environment' => app()->environment(),
            ...$payload,
        ], $status);
    }
}

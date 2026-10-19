<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\PendingMigrations;
use Dedoc\Scramble\Attributes\ExcludeRouteFromDocs;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Throwable;

/**
 * The token-gated post-deploy migration endpoint.
 *
 * The contract belongs to the caller. tools/dbmigrate.mjs is the only one
 * (`npm run dbmigrate:<env>` wraps it, and staging/README.md documents it), and
 * this controller conforms to it. The caller:
 *
 *  - sends the secret in the X-Migrate-Token header (see __invoke),
 *  - appends `?mode=dry-run` or `?mode=apply`,
 *  - treats a non-2xx response or a `status` other than 'ok' as failure and
 *    exits non-zero,
 *  - prints `pending[]` after a dry run and `applied[]` after an apply, both as
 *    arrays of migration names,
 *  - and ignores every other key.
 *
 * `ok` is a boolean mirror of `status` kept for tools/smoke-docker.mjs, which
 * asserts {ok: true} plus a string `output` to prove the local stack dispatched
 * /api/migrate into Laravel at all.
 */
class MigrateController extends Controller
{
    /**
     * The shared secret arrives in the X-Migrate-Token header, never as a
     * request parameter:
     *
     *  - tools/dbmigrate.mjs sends that header, so reading a parameter would
     *    403 every `npm run dbmigrate:<env>`.
     *  - $request->input() also reads the query string, which Apache writes
     *    to its access log, so ?token=... would put the secret on disk in
     *    plain text.
     */
    // Excluded from the OpenAPI document on purpose: this is deploy tooling
    // called with a shared secret, and nothing in the browser may trigger a
    // migration.
    #[ExcludeRouteFromDocs]
    public function __invoke(Request $request): JsonResponse
    {
        $expectedToken = config('app.migrate_token');
        $providedToken = $request->header('X-Migrate-Token');

        if (! $expectedToken || ! $providedToken || ! hash_equals($expectedToken, (string) $providedToken)) {
            return response()->json(['error' => 'Invalid or missing token'], 403);
        }

        // Anything but exactly 'apply' means dry-run, so a missing, misspelled
        // or truncated mode never writes to the database.
        $mode = $request->query('mode') === 'apply' ? 'apply' : 'dry-run';

        try {
            return $mode === 'apply' ? $this->apply() : $this->dryRun();
        } catch (Throwable $e) {
            // Non-2xx and status 'error', since the caller treats either as
            // failure, and a failed migration reported as success would hide a
            // broken deploy.
            $body = [
                'status' => 'error',
                'ok' => false,
                'error' => $e->getMessage(),
                'applied' => [],
                'pending' => [],
                'output' => Artisan::output(),
            ];

            return $this->respond($mode, 500, $body);
        }
    }

    /**
     * Report what would run, touching neither the schema nor the migrations
     * table.
     *
     * Reads the pending list instead of calling `migrate --pretend`, which
     * emits SQL rather than the names the caller wants, and still boots every
     * pending migration class to get there.
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
     * @return list<string>
     */
    private function pendingMigrations(): array
    {
        return PendingMigrations::names();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function respond(string $mode, int $status, array $payload): JsonResponse
    {
        return response()->json([
            'mode' => $mode,
            // Informational: the caller logs the body verbatim, so this tells
            // an operator which server answered.
            'environment' => app()->environment(),
            ...$payload,
        ], $status);
    }
}

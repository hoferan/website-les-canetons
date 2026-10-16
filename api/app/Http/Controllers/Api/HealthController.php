<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Environment;
use App\Support\PendingMigrations;
use Dedoc\Scramble\Attributes\ExcludeRouteFromDocs;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Whether this server answers, whether its database does, and which deploy it
 * is running (#110).
 *
 * The deploy writes deployment.json to the document root, where the SPA
 * fallback serves the shell in its place, so this is the only way to ask a
 * server what it runs without an FTP client.
 *
 * PUBLIC, and with every detail. The repository is public, so the commit and
 * the migration names tell nobody anything GitHub does not, and the
 * environment is already in GET /api/v1/config. TEST and QA sit behind the
 * site's Basic Auth anyway.
 *
 * BEHIND RunPendingMigrations, like every other /api/* route. A monitor
 * therefore sees what a visitor sees: a migration that fails answers the same
 * 503 `service_unavailable` here as everywhere, and a monitor's poll after a
 * deploy applies the new migrations like any first request would. Any status
 * but 200 means unhealthy. With AUTO_MIGRATE=false the middleware stands
 * aside, and `pendingMigrations` is how to see what the server is behind on.
 *
 * Kept out of the OpenAPI document, like /api/migrate: it is for operators
 * and monitors, and the generated client has no use for it.
 */
class HealthController extends Controller
{
    #[ExcludeRouteFromDocs]
    public function __invoke(): JsonResponse
    {
        $database = $this->databaseAnswers();

        return response()->json([
            'status' => $database ? 'ok' : 'fail',
            'environment' => Environment::name(),
            'deployment' => $this->deployment(),
            'checks' => [
                'database' => $database ? 'ok' : 'fail',
                // Reading the ledger needs the database that just failed.
                'pendingMigrations' => $database ? PendingMigrations::names() : null,
            ],
        ], $database ? 200 : 503)->header('Cache-Control', 'no-store');
    }

    private function databaseAnswers(): bool
    {
        try {
            DB::select('SELECT 1');

            return true;
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }

    /**
     * The deploy marker's commit, ref and time, or null where there is none:
     * the local stack, a server uploaded by hand, or a file that does not
     * parse. tools/deploy/local.mjs writes it.
     *
     * @return array{commit: string, ref: string|null, deployedAt: string|null}|null
     */
    private function deployment(): ?array
    {
        $path = (string) config('api.deployment_marker');
        $raw = is_file($path) ? @file_get_contents($path) : false;
        $marker = $raw === false ? null : json_decode($raw, true);

        if (! is_array($marker) || ! is_string($marker['commit'] ?? null)) {
            return null;
        }

        return [
            'commit' => $marker['commit'],
            'ref' => is_string($marker['ref'] ?? null) ? $marker['ref'] : null,
            'deployedAt' => is_string($marker['deployedAt'] ?? null) ? $marker['deployedAt'] : null,
        ];
    }
}

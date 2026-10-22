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
 * is running (#110). Also the host's limits on an upload's size (#229), which
 * nothing else in the API can tell an operator without shell access.
 *
 * The deploy writes deployment.json to the document root, where the SPA
 * fallback serves the shell in its place, so this is the only way to ask a
 * server what it runs without an FTP client.
 *
 * Public, with every detail. The repository is public, so the commit and the
 * migration names reveal nothing GitHub does not, and the environment is
 * already in GET /api/v1/config. TEST and QA sit behind Basic Auth anyway.
 *
 * Behind RunPendingMigrations like every other /api/* route, so a monitor sees
 * what a visitor sees: a failing migration answers the same 503
 * `service_unavailable` here, and a poll after a deploy applies new migrations
 * like any first request. Any status but 200 means unhealthy. With
 * AUTO_MIGRATE=false the middleware stands aside, and `pendingMigrations`
 * shows what the server is behind on.
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
            'limits' => [
                'uploadMaxFilesize' => ini_get('upload_max_filesize'),
                'postMaxSize' => ini_get('post_max_size'),
                'maxAllowedPacket' => $database ? $this->maxAllowedPacket() : null,
            ],
        ], $database ? 200 : 503)->header('Cache-Control', 'no-store');
    }

    /**
     * The largest single statement MariaDB accepts, in bytes. One image size
     * is one INSERT (ADR 0028), so this caps a photo. The host owns the value
     * and a shared account cannot read it any other way (#229).
     */
    private function maxAllowedPacket(): ?int
    {
        try {
            return (int) DB::selectOne('SELECT @@max_allowed_packet AS bytes')->bytes;
        } catch (Throwable $e) {
            report($e);

            return null;
        }
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

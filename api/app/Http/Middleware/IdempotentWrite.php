<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiError;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Makes a retried public submission safe to send twice.
 *
 * `idempotent` on a route. The caller sends an `Idempotency-Key`; the first
 * request runs and its answer is stored under that key; a second request
 * carrying the same key and the same body gets the stored answer back and
 * creates nothing.
 *
 * A guest whose connection stalls taps Book again, and nothing in the second
 * request distinguishes it from a second guest, so the client has to say so
 * with the key.
 *
 * The key is required on both routes that carry this, as the draft
 * (draft-ietf-httpapi-idempotency-key-header) allows. Those endpoints already
 * require the `X-Form-Token` from PublicWriteGuard, so any caller able to
 * submit is already reading the reference.
 *
 * It runs after PublicWriteGuard and the throttle, so a replay still costs a
 * valid form token and a slot in the rate limit. A genuine retry arrives
 * seconds later with the same token, which stays valid for two hours.
 *
 * The unique index is the lock. Two racing taps both insert the in-progress
 * row; one gets through and the other is told the first is still running.
 * Nothing needs releasing on a fatal error: a stranded row is reclaimed by age.
 *
 * This host has no scheduler, so expired rows are swept by lottery on write,
 * the way Laravel sweeps sessions.
 */
class IdempotentWrite
{
    public const HEADER = 'Idempotency-Key';

    /** Says a response is the stored answer to a request already made. */
    public const REPLAY_HEADER = 'Idempotency-Replayed';

    /**
     * A key must be long enough not to collide with another caller's.
     *
     * These endpoints are anonymous, so every caller shares the key space. The
     * fingerprint turns a collision into a 409, never somebody else's booking,
     * but a guest cannot act on that 409; refusing a short key says what is
     * wrong. Sixteen characters is under a UUID and over anything typed by hand.
     */
    private const MINIMUM_KEY_LENGTH = 16;

    private const MAXIMUM_KEY_LENGTH = 255;

    /**
     * How long a stranded `in_progress` row blocks its key.
     *
     * A request that dies between the insert and the response (a PHP fatal, a
     * worker killed by the shared host) leaves a row nothing will complete,
     * and the key would answer 409 until it expires. One minute is far longer
     * than either endpoint takes.
     */
    private const ABANDONED_AFTER_SECONDS = 60;

    public function handle(Request $request, Closure $next): Response
    {
        $key = $request->headers->get(self::HEADER);

        if ($key === null || trim($key) === '') {
            return ApiError::json(400, 'idempotency_key_required', 'Idempotency-Key is required');
        }

        $key = trim($key);

        if (! $this->isWellFormed($key)) {
            return ApiError::json(400, 'idempotency_key_invalid', 'Idempotency-Key is not well formed');
        }

        $endpoint = $request->getPathInfo();
        $fingerprint = $this->fingerprint($request);

        $stored = $this->claim($key, $endpoint, $fingerprint);

        if ($stored instanceof Response) {
            return $stored;
        }

        $response = $next($request);

        if ($response->isSuccessful()) {
            $this->remember($key, $endpoint, $response);
        } else {
            // Nothing was written, so the key is given back: a guest who
            // mistyped their address can correct it and resubmit.
            $this->release($key, $endpoint);
        }

        $this->sweep();

        return $response;
    }

    /**
     * Takes the key, or answers for the request that already has it.
     *
     * Returns null when this request may proceed, otherwise the stored answer
     * or a refusal.
     */
    private function claim(string $key, string $endpoint, string $fingerprint): ?Response
    {
        try {
            DB::table('idempotency_keys')->insert([
                'idempotency_key' => $key,
                'endpoint' => $endpoint,
                'fingerprint' => $fingerprint,
                'status' => 'in_progress',
                'created_at' => now(),
                'expires_at' => now()->addHours($this->retentionHours()),
            ]);

            return null;
        } catch (QueryException) {
            // The unique index refused it: somebody holds this key already.
        }

        $existing = DB::table('idempotency_keys')
            ->where('idempotency_key', $key)
            ->where('endpoint', $endpoint)
            ->first();

        if ($existing === null) {
            // The row was swept or released between the failed insert and
            // this read. Nothing holds the key, so the request goes through.
            return null;
        }

        if ($existing->fingerprint !== $fingerprint) {
            return ApiError::json(409, 'idempotency_key_reuse', 'This Idempotency-Key was used for a different request');
        }

        if ($existing->status === 'completed') {
            return $this->replay($existing);
        }

        // Still running, or stranded by a request that died. A stranded row is
        // taken over; see ABANDONED_AFTER_SECONDS.
        $startedAt = strtotime((string) $existing->created_at);

        if ($startedAt !== false && (now()->timestamp - $startedAt) > self::ABANDONED_AFTER_SECONDS) {
            return null;
        }

        return ApiError::json(409, 'idempotency_key_reuse', 'A request with this Idempotency-Key is still in flight');
    }

    /** The stored answer, said again, and labelled as an echo. */
    private function replay(object $stored): Response
    {
        $response = new Response(
            (string) ($stored->response_body ?? ''),
            (int) ($stored->response_status ?? 200),
        );

        if ($stored->response_content_type !== null) {
            $response->headers->set('Content-Type', (string) $stored->response_content_type);
        }

        // Lets a client tell a fresh acceptance from an echo of one it already
        // had. This header is not in the draft.
        $response->headers->set(self::REPLAY_HEADER, 'true');

        return $response;
    }

    /**
     * Stores the answer a replay will get.
     *
     * It stores what the controller said, which is not always what the client
     * sees. This middleware sits inside PaginatesCollections, which envelopes
     * a JSON list after this runs but skips the plain Response from replay().
     * Both `idempotent` routes answer with an object, so the shapes agree; a
     * route answering a list would get `{data, meta}` first and a bare array
     * on retry.
     */
    private function remember(string $key, string $endpoint, Response $response): void
    {
        DB::table('idempotency_keys')
            ->where('idempotency_key', $key)
            ->where('endpoint', $endpoint)
            ->update([
                'status' => 'completed',
                'response_status' => $response->getStatusCode(),
                'response_content_type' => $response->headers->get('Content-Type'),
                'response_body' => $response->getContent(),
            ]);
    }

    private function release(string $key, string $endpoint): void
    {
        DB::table('idempotency_keys')
            ->where('idempotency_key', $key)
            ->where('endpoint', $endpoint)
            ->where('status', 'in_progress')
            ->delete();
    }

    /**
     * Deletes expired rows, sometimes.
     *
     * A lottery, the way Laravel sweeps sessions, because this host has no
     * cron. Configured so a test can make it certain. Both keys live in
     * config/api.php and must stay out of api/.env.example, where an extra key
     * refuses every server's next deploy.
     */
    private function sweep(): void
    {
        [$chances, $out_of] = config('api.idempotency.lottery', [2, 100]);

        if (random_int(1, (int) $out_of) > (int) $chances) {
            return;
        }

        DB::table('idempotency_keys')->where('expires_at', '<', now())->delete();
    }

    private function retentionHours(): int
    {
        return (int) config('api.idempotency.retention_hours', 24);
    }

    /**
     * What makes a replay a replay rather than a collision.
     *
     * The raw body, not the parsed input: anything that changes the bytes is a
     * different submission. The method and path are included as well, although
     * the endpoint column already scopes the key.
     */
    private function fingerprint(Request $request): string
    {
        return hash('sha256', implode("\n", [
            $request->getMethod(),
            $request->getPathInfo(),
            (string) $request->getContent(),
        ]));
    }

    private function isWellFormed(string $key): bool
    {
        // Printable ASCII only, since the key is stored, logged and compared.
        return preg_match('/^[\x21-\x7E]{'.self::MINIMUM_KEY_LENGTH.','.self::MAXIMUM_KEY_LENGTH.'}$/', $key) === 1;
    }
}

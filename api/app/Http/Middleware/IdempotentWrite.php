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
 * THE FAILURE IS ANONYMOUS AND IT COSTS SOMEBODY ELSE MONEY. A guest on a
 * phone at the hall taps Book, the connection stalls, they tap again, and the
 * caterer counts two meals for one person. The guest sees one confirmation and
 * finds out about the second booking when the committee telephones. Nothing in
 * the request itself distinguishes the second tap from a second guest, so the
 * client has to say, and the key is how.
 *
 * REQUIRED, NOT OPTIONAL, on both routes that carry this. The draft
 * (draft-ietf-httpapi-idempotency-key-header) lets a server require it, and
 * these two endpoints already require a header nobody gets for free — the
 * `X-Form-Token` from PublicWriteGuard — so a caller able to submit at all is
 * already reading the reference. The alternative is a protection that only
 * protects the clients who did not need it.
 *
 * AFTER PublicWriteGuard AND THE THROTTLE, deliberately: a replay still costs
 * a valid form token and a slot in the rate limit, so a stored key cannot be
 * used to walk past the anti-abuse guard. A genuine retry arrives seconds
 * later with the same token, which stays valid for two hours.
 *
 * THE UNIQUE INDEX IS THE LOCK. Two taps racing each other both try to insert
 * the in-progress row; the database lets one through and the other is told the
 * first is still running. Nothing has to be released on a fatal error, because
 * nothing was acquired: a row stranded by a crash is reclaimed by age.
 *
 * NOTHING SWEEPS THIS TABLE ON A TIMER — this host has no scheduler and no
 * shell to install one from. Expired rows go by lottery on write, which is how
 * Laravel already sweeps sessions.
 */
class IdempotentWrite
{
    public const HEADER = 'Idempotency-Key';

    /** Says a response is the stored answer to a request already made. */
    public const REPLAY_HEADER = 'Idempotency-Replayed';

    /**
     * A key must be long enough not to collide with another caller's.
     *
     * These endpoints are anonymous, so the key space is shared with everyone
     * on the internet: a caller sending `1` collides with every other caller
     * sending `1`. The fingerprint below catches such a collision and answers
     * 409, so nobody is ever handed somebody else's booking — but a 409 a
     * guest cannot act on is a dead end, and refusing the short key is the one
     * moment we can say what the problem is. Sixteen characters is under a
     * UUID and over anything a person would type by hand.
     */
    private const MINIMUM_KEY_LENGTH = 16;

    private const MAXIMUM_KEY_LENGTH = 255;

    /**
     * How long a stranded `in_progress` row blocks its key.
     *
     * A request that dies between the insert and the response — a PHP fatal, a
     * worker killed by this shared host — leaves a row nothing will ever
     * complete. Without this the client's key is unusable until the row
     * expires, and the guest sees a 409 they cannot get past. One minute is
     * far longer than either of these endpoints takes and far shorter than a
     * person's patience.
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
            // Nothing was written, so nothing is being retried: give the key
            // back rather than holding it. A guest who mistyped their address
            // would otherwise have to reload the whole form to correct it.
            $this->release($key, $endpoint);
        }

        $this->sweep();

        return $response;
    }

    /**
     * Takes the key, or answers for the request that already has it.
     *
     * Returns null when this request may proceed, and a Response — the stored
     * answer, or a refusal — when it may not.
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
            // The unique index refused it, so somebody has this key already.
            // Which of the three answers below they get depends on what they
            // did with it.
        }

        $existing = DB::table('idempotency_keys')
            ->where('idempotency_key', $key)
            ->where('endpoint', $endpoint)
            ->first();

        if ($existing === null) {
            // The row went between the failed insert and this read — expired
            // by another request's sweep, or released by a failure. Nothing
            // holds the key, so let this request through rather than refusing
            // on the strength of a row that no longer exists.
            return null;
        }

        if ($existing->fingerprint !== $fingerprint) {
            return ApiError::json(409, 'idempotency_key_reuse', 'This Idempotency-Key was used for a different request');
        }

        if ($existing->status === 'completed') {
            return $this->replay($existing);
        }

        // Still running, or stranded by a request that died before it could
        // say. Taking it over is what keeps a crash from costing the guest
        // their key; see ABANDONED_AFTER_SECONDS.
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

        // So a client can tell a fresh acceptance from an echo of one it
        // already had — which is the difference between "your booking is
        // recorded" and "your booking was already recorded". Not in the draft;
        // it costs one header and it is the only way to know from the outside.
        $response->headers->set(self::REPLAY_HEADER, 'true');

        return $response;
    }

    /**
     * Stores the answer a replay will get.
     *
     * IT STORES WHAT THE CONTROLLER SAID, NOT WHAT THE CLIENT WILL SEE. This
     * middleware sits inside App\Http\Middleware\PaginatesCollections, so a
     * body that is a JSON list is enveloped after this runs, and replay() below
     * returns a plain Response that the envelope then skips. Both routes behind
     * `idempotent` answer with an object today, so the two shapes cannot
     * differ — but the day one answers a list, the first attempt would get
     * `{data, meta}` and the retry a bare array, which is the one thing an
     * idempotent endpoint promises cannot happen.
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
     * A lottery rather than a schedule, the way Laravel sweeps its sessions,
     * because this host has no cron and no shell to add one from. Configured
     * rather than hard-coded so a test can make it certain; both keys live in
     * config/api.php and neither may ever appear in api/.env.example, where an
     * extra key refuses every server's next deploy.
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
     * The raw body, not the parsed input: two requests that parse the same are
     * the same request, and anything that changes the bytes is a different
     * submission worth refusing. The method and path are in it because the key
     * is only scoped to the endpoint by its own column, and a belt here costs
     * nothing.
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
        // Printable ASCII only. The key is stored, logged and compared, and a
        // control character in any of those is a problem nobody asked for.
        return preg_match('/^[\x21-\x7E]{'.self::MINIMUM_KEY_LENGTH.','.self::MAXIMUM_KEY_LENGTH.'}$/', $key) === 1;
    }
}

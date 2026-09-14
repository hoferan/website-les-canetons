<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a retried public submission is answered with.
 *
 * A guest on a phone at the hall taps Book, the connection stalls, they tap
 * again, and the caterer counts two meals for one person. The guest sees one
 * confirmation and learns about the second booking when the committee
 * telephones. This table is how the second tap is recognised as the first one
 * again: App\Http\Middleware\IdempotentWrite stores the answer under the
 * caller's `Idempotency-Key` and replays it.
 *
 * UNIQUE(idempotency_key, endpoint) IS THE LOCK. Two taps racing each other
 * both try to insert; the database lets exactly one through and the loser is
 * told the first is still running. There is no application-level lock, no
 * advisory lock and nothing to release on a fatal error — the constraint does
 * all of it, and a row left behind by a crash is reclaimed by age rather than
 * by cleanup (see the middleware).
 *
 * SCOPED BY ENDPOINT, so a guest whose booking and whose message happen to
 * carry the same key is making two submissions and neither is a retry of the
 * other. Scoping any wider would mean one key could only ever be used once
 * across the whole API, which is not what the draft asks for and is not what a
 * form-per-page client does.
 *
 * NOT SCOPED BY CALLER, and that is worth saying out loud: these two endpoints
 * are anonymous, so the key space is shared with everyone on the internet. A
 * caller sending `1` would collide with every other caller sending `1`. Two
 * defences, both in the middleware: a minimum key length, and a fingerprint of
 * the request that a replay has to match — so a collision between two
 * different submissions answers 409 rather than handing one guest the other's
 * booking.
 *
 * `response_body` is TEXT, which is 64 KB on MariaDB. A booking renders under
 * two, and the only bodies stored here are these two endpoints' own.
 *
 * NO SCHEDULER ON THIS HOST, so nothing sweeps this table on a timer.
 * Expired rows are deleted by a lottery on write, the way Laravel already
 * sweeps sessions. `expires_at` is indexed for that one query.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, like every migration here: RunPendingMigrations
        // re-checks for pending work on every request, so a partial failure
        // mid-deploy can re-enter this file against a database where the
        // table already exists.
        if (Schema::hasTable('idempotency_keys')) {
            return;
        }

        Schema::create('idempotency_keys', function (Blueprint $table) {
            $table->id();

            // 255 is the length the middleware caps a key at. Longer than any
            // UUID or ULID a client should be sending, and short enough to
            // index alongside the endpoint below.
            $table->string('idempotency_key', 255);

            // The route's own path, not the request URI: two bookings for two
            // different events are two endpoints here, which is correct — a
            // key reused across them is a different submission either way, and
            // the fingerprint would refuse it regardless.
            $table->string('endpoint', 191);

            // sha256 of the method, the path and the raw body. What makes a
            // replay a replay rather than a collision.
            $table->char('fingerprint', 64);

            // `in_progress` until the response is known, then `completed`.
            // A request that FAILED deletes its row instead of completing it,
            // so the key goes back to the client: nothing was written, so
            // nothing is being retried, and a guest who mistyped their address
            // would otherwise have to reload the whole form to correct it.
            $table->string('status', 16);

            $table->unsignedSmallInteger('response_status')->nullable();
            $table->string('response_content_type', 191)->nullable();
            $table->text('response_body')->nullable();

            // DATETIME, not TIMESTAMP, and that is MariaDB 10.3 rather than a
            // preference. With `explicit_defaults_for_timestamp` off — the
            // default on this version, and on the shared host — the first
            // TIMESTAMP column in a table implicitly gets
            // DEFAULT CURRENT_TIMESTAMP and every later one gets
            // '0000-00-00 00:00:00', which strict mode then refuses outright:
            // `Invalid default value for 'expires_at'`, and the whole
            // migration fails. The middleware writes both values explicitly,
            // so neither column wants a default anyway.
            $table->dateTime('created_at');
            $table->dateTime('expires_at');

            // The lock. See the note on this file.
            $table->unique(['idempotency_key', 'endpoint']);

            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('idempotency_keys');
    }
};

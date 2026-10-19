<?php

namespace Tests\Feature;

use App\Exceptions\ApiError;
use App\Models\Member;
use App\Models\Role;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * #231: the If-Match check and the write it guards are one atomic step.
 *
 * Without a lock, two requests carrying the same tag could both pass the check
 * before either wrote, and the second would overwrite the first. ConditionalWrite
 * locks the row before it compares and holds the lock until the write commits,
 * so the second waits, re-reads, and is refused with a 412.
 *
 * A single PHP process cannot send two requests at once, so a second database
 * connection tries to lock the same row just as the controller is about to
 * write, and must be made to wait.
 *
 * The row is the seeded `committee` role, for two reasons. The test's own rows
 * are uncommitted inside RefreshDatabase's transaction, and a second connection
 * waits on those whatever the code under test does. And no fixture here
 * attaches `committee`, whose foreign key would take a lock of its own.
 */
class ConditionalWriteLockTest extends TestCase
{
    use RefreshDatabase;

    private const PROBE = 'lock_probe';

    private Member $editor;

    private Role $committee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->editor = Member::factory()->administrator()->create();
        $this->committee = Role::query()->where('key', 'committee')->sole();

        $default = (string) config('database.default');
        config(['database.connections.'.self::PROBE => config("database.connections.{$default}")]);
    }

    protected function tearDown(): void
    {
        DB::purge(self::PROBE);

        parent::tearDown();
    }

    public function test_the_row_stays_locked_from_the_check_until_the_write(): void
    {
        $probed = $this->probeBeforeTheFirstWrite('roles', $this->committee->id);

        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('role', $this->committee))
            ->patchJson("/api/v1/roles/{$this->committee->id}", ['labelFr' => 'Comité élargi'])
            ->assertOk();

        $this->assertSame('waited', $probed(), 'Another connection could lock the row between the check and the write.');
    }

    public function test_a_refused_write_leaves_nothing_behind(): void
    {
        // A write that changes the row and then answers an error. Without the
        // rollback, the change would commit with nobody told it happened.
        Route::middleware(['api', 'auth:sanctum', 'etag:role'])
            ->patch('/api/v1/_test/roles/{role}', function (Role $role) {
                $role->update(['label_fr' => 'Half written']);

                return ApiError::json(409, 'conflict', 'Refused after writing');
            });

        $this->actingAsMember($this->editor)
            ->withHeaders($this->ifMatch('role', $this->committee))
            ->patchJson("/api/v1/_test/roles/{$this->committee->id}")
            ->assertStatus(409);

        $this->assertNotSame('Half written', $this->committee->fresh()?->label_fr);
    }

    public function test_the_controller_gets_the_row_as_read_under_the_lock(): void
    {
        // Changed after the route bound it, before the middleware locked it.
        // The check passes, because the client read the new state, and the
        // controller must then see that state too, not the one bound earlier.
        Route::middleware(['api', 'auth:sanctum', 'etag:role'])
            ->patch('/api/v1/_test/roles/{role}', fn (Role $role) => response()->json(['labelFr' => $role->label_fr]));

        $row = DB::table('roles')->where('id', $this->committee->id);
        $original = $this->committee->label_fr;

        // The tag of the state the client will have read.
        $row->clone()->update(['label_fr' => 'Changed meanwhile']);
        $tag = $this->ifMatch('role', $this->committee);
        $row->clone()->update(['label_fr' => $original]);

        // Route model binding's query is the unqualified one; the
        // middleware's own re-read is qualified and locking.
        $bound = false;
        DB::listen(function ($query) use (&$bound, $row): void {
            if (! $bound && str_contains($query->sql, 'from `roles` where `id` = ?')) {
                $bound = true;
                $row->clone()->update(['label_fr' => 'Changed meanwhile']);
            }
        });

        $this->actingAsMember($this->editor)
            ->withHeaders($tag)
            ->patchJson("/api/v1/_test/roles/{$this->committee->id}")
            ->assertOk()
            ->assertJsonPath('labelFr', 'Changed meanwhile');
    }

    /**
     * Arms a probe: just before the request's first INSERT, UPDATE or DELETE,
     * a second connection tries to lock the row for one second. The returned
     * closure reports `waited` when it had to give up, `locked` when it got
     * the row, and null when no write ran at all.
     *
     * @return \Closure(): ?string
     */
    private function probeBeforeTheFirstWrite(string $table, int $id): \Closure
    {
        $outcome = null;

        DB::connection()->beforeExecuting(function (string $sql, array $bindings, Connection $connection) use (&$outcome, $table, $id): void {
            if ($outcome !== null || $connection->getName() === self::PROBE || ! preg_match('/^\s*(insert|update|delete)\b/i', $sql)) {
                return;
            }

            $probe = DB::connection(self::PROBE);
            $probe->statement('SET SESSION innodb_lock_wait_timeout = 1');
            $probe->beginTransaction();
            try {
                $probe->table($table)->where('id', $id)->lockForUpdate()->first();
                $outcome = 'locked';
            } catch (QueryException $e) {
                // 1205: lock wait timeout exceeded.
                $outcome = ($e->errorInfo[1] ?? null) === 1205 ? 'waited' : throw $e;
            } finally {
                $probe->rollBack();
            }
        });

        return function () use (&$outcome): ?string {
            return $outcome;
        };
    }
}

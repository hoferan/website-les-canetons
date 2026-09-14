<?php

namespace Tests\Feature;

use App\Models\CommitteeFunction;
use App\Models\Member;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * The committee's seats, as reference data.
 *
 * They were free text on the member row until 2026-09-14: whoever edited the
 * roster typed a seat name, so the public page could only sort alphabetically —
 * "Caissière" above "Présidente" — a typo was published, and a typed name is
 * content no translation layer can ever reach. A table with a `sort_order`
 * answers all three at once, and it is the same rung of the editability ladder
 * the registers sit on (design §3.1): editable in the database today, editable
 * by the committee when the deferred editor ships.
 *
 * A MIGRATION SEEDS IT, like the registers and for the same reason: the shared
 * host has no shell, so `artisan db:seed` can never reach a server.
 */
class CommitteeFunctionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_legacy_seats_exist_in_the_committees_own_order(): void
    {
        $names = CommitteeFunction::orderBy('sort_order')->pluck('name')->all();

        // Recovered verbatim from the pre-rebuild /comite-team-direction page,
        // gendered spellings included. Whether they should read "Président·e"
        // is a question for the band, and the point of a table is that they can
        // answer it themselves without a deploy.
        $this->assertSame([
            'Présidente',
            'Vice-présidente - secrétaire',
            'Responsable prestations',
            'Responsable caisse',
            'Responsable intendance',
            'Responsable costumes',
            'Responsable Team Direction',
            'Membre',
        ], $names);
    }

    public function test_the_member_row_no_longer_carries_a_typed_seat_name(): void
    {
        // The column is gone rather than deprecated. Leaving it would leave two
        // sources for one fact, and the older one is the one the public page
        // used to read.
        $this->assertFalse(Schema::hasColumn('members', 'committee_title'));
        $this->assertTrue(Schema::hasColumn('members', 'committee_function_id'));
    }

    public function test_a_seat_the_committee_renamed_survives_a_re_migration(): void
    {
        // The migration's up() is invoked DIRECTLY, exactly as
        // SeedRegistersAndRolesTest does: RefreshDatabase has already migrated,
        // so `artisan migrate` would find nothing pending and the idempotency
        // this claims to test would never run. RunPendingMigrations re-checks
        // for pending work on every request, and the same file runs against
        // TEST, QA and PROD.
        CommitteeFunction::where('name', 'Membre')->sole()->update(['name' => 'Membre du comité']);

        $this->migration()->up();

        $this->assertSame(8, CommitteeFunction::count(), 'a renamed seat must not be resurrected under its old name');
        $this->assertTrue(CommitteeFunction::where('name', 'Membre du comité')->exists());
    }

    public function test_it_carries_a_typed_seat_over_to_the_matching_reference_row(): void
    {
        // A server that has been running the free-text column has data in it.
        // Re-creating the old shape and re-running the migration is the only
        // way to exercise the carry-over, because RefreshDatabase starts from
        // the finished schema.
        $member = Member::factory()->create();
        $this->reintroduceTheTypedColumn($member->id, 'Responsable costumes');

        $this->migration()->up();

        $this->assertSame(
            CommitteeFunction::where('name', 'Responsable costumes')->sole()->id,
            $member->fresh()?->committee_function_id,
        );
    }

    public function test_it_keeps_a_seat_nobody_predicted_by_creating_a_row_for_it(): void
    {
        // The eight are the seats the band had. A committee that typed a ninth
        // must not lose it to a migration — dropping the column would publish a
        // /committee page one card shorter than the day before, and nobody
        // would know which card.
        $member = Member::factory()->create();
        $this->reintroduceTheTypedColumn($member->id, 'Porte-drapeau');

        $this->migration()->up();

        $seat = CommitteeFunction::where('name', 'Porte-drapeau')->sole();
        $this->assertSame(9, $seat->sort_order, 'an unforeseen seat is appended, never inserted among the eight');
        $this->assertSame($seat->id, $member->fresh()?->committee_function_id);
    }

    public function test_a_blank_typed_seat_carries_over_as_no_seat_at_all(): void
    {
        // The old roster form wrote '' rather than null when somebody cleared
        // the field, and CommitteeController trimmed it away at read time. That
        // filter is gone now, so the blank has to be resolved HERE — otherwise
        // a member with no seat arrives holding a reference row named ''.
        $member = Member::factory()->create();
        $this->reintroduceTheTypedColumn($member->id, '   ');

        $this->migration()->up();

        $this->assertNull($member->fresh()?->committee_function_id);
        $this->assertSame(8, CommitteeFunction::count());
    }

    private function migration(): object
    {
        return require database_path('migrations/2026_09_14_000001_seat_the_committee.php');
    }

    /**
     * Put a server back in its pre-migration state for one member: the typed
     * column present and filled, the reference one empty.
     */
    private function reintroduceTheTypedColumn(int $memberId, string $title): void
    {
        Schema::table('members', function ($table) {
            $table->string('committee_title')->nullable();
        });

        DB::table('members')->where('id', $memberId)->update([
            'committee_title' => $title,
            'committee_function_id' => null,
        ]);
    }
}

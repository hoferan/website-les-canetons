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
 * A table with a `sort_order` lets the public page follow the committee's
 * order instead of the alphabet, and a seat picked from it cannot be mistyped.
 * It sits on the same rung of the editability ladder as the registers
 * (ADR 0014): editable in the database today, by the committee once the
 * deferred editor ships.
 *
 * A migration seeds it, like the registers: the shared host has no shell, so
 * `artisan db:seed` never reaches a server.
 */
class CommitteeFunctionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_legacy_seats_exist_in_the_committees_own_order(): void
    {
        $names = CommitteeFunction::orderBy('sort_order')->pluck('name')->all();

        // Verbatim from the band's earlier committee page, gendered spellings
        // included. Whether they should read "Président·e" is for the band to
        // decide, and the table lets them change it without a deploy.
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
        // The migration drops the typed column, so one fact has one source.
        $this->assertFalse(Schema::hasColumn('members', 'committee_title'));
        $this->assertTrue(Schema::hasColumn('members', 'committee_function_id'));
    }

    public function test_a_seat_the_committee_renamed_survives_a_re_migration(): void
    {
        // up() is called directly, as in SeedRegistersAndRolesTest:
        // RefreshDatabase has already migrated, so `artisan migrate` would find
        // nothing pending. The same file runs on every server, and
        // RunPendingMigrations re-checks on every request.
        CommitteeFunction::where('name', 'Membre')->sole()->update(['name' => 'Membre du comité']);

        $this->migration()->up();

        $this->assertSame(8, CommitteeFunction::count(), 'a renamed seat must not be resurrected under its old name');
        $this->assertTrue(CommitteeFunction::where('name', 'Membre du comité')->exists());
    }

    public function test_it_carries_a_typed_seat_over_to_the_matching_reference_row(): void
    {
        // A server still on the free-text column has data in it. RefreshDatabase
        // starts from the finished schema, so the old shape is recreated to
        // exercise the carry-over.
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
        // A typed seat outside the eight must survive the migration, or the
        // /committee page loses a card and nobody knows which.
        $member = Member::factory()->create();
        $this->reintroduceTheTypedColumn($member->id, 'Porte-drapeau');

        $this->migration()->up();

        $seat = CommitteeFunction::where('name', 'Porte-drapeau')->sole();
        $this->assertSame(9, $seat->sort_order, 'an unforeseen seat is appended, never inserted among the eight');
        $this->assertSame($seat->id, $member->fresh()?->committee_function_id);
    }

    public function test_a_blank_typed_seat_carries_over_as_no_seat_at_all(): void
    {
        // A cleared field in the typed column holds '' rather than null, and
        // nothing filters it at read time, so the migration resolves it here.
        // Otherwise a member with no seat would hold a reference row named ''.
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

<?php

namespace Tests\Feature;

use App\Models\BookingChange;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Support\BookingChangeKind;
use App\Support\FormAudience;
use App\Support\OptionKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use RuntimeException;
use Tests\TestCase;

/**
 * Every booking write lands in the journal once, after it commits, and only
 * when something the committee would see changed (#123, ADR 0035).
 */
class BookingJournalTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_public_booking_records_new_without_actor(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id]);

        $this->bookPublicly($event, [['optionId' => $meal->id, 'quantity' => 2]])->assertCreated();

        $row = BookingChange::sole();
        $this->assertSame(BookingChangeKind::Created, $row->change);
        $this->assertSame($event->id, $row->event_id);
        $this->assertSame(Registration::sole()->id, $row->registration_id);
        $this->assertNull($row->actor_member_id);
        $this->assertNull($row->actor_label);
    }

    public function test_a_member_booking_records_new_with_the_member(): void
    {
        [$event, $meal] = $this->membersForm();
        $anna = Member::factory()->named('Anna', 'Muster', 'anna')->create();

        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1]]);

        $row = BookingChange::sole();
        $this->assertSame(BookingChangeKind::Created, $row->change);
        $this->assertSame($anna->id, $row->actor_member_id);
        $this->assertSame('Anna Muster', $row->actor_label);
    }

    public function test_an_untouched_member_resave_records_nothing(): void
    {
        [$event, $meal, $size] = $this->membersForm();
        $anna = Member::factory()->create();
        $answers = [['optionId' => $meal->id, 'quantity' => 2], ['optionId' => $size->id, 'value' => 'M']];

        $this->bookAs($anna, $event, $answers);
        // The screen sends the answers back in another order; still no change.
        $this->bookAs($anna, $event, array_reverse($answers));

        $this->assertSame([BookingChangeKind::Created], BookingChange::pluck('change')->all());
    }

    public function test_a_member_changing_an_answer_records_one_changed(): void
    {
        [$event, $meal, $size] = $this->membersForm();
        $anna = Member::factory()->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 2], ['optionId' => $size->id, 'value' => 'M']]);

        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 2], ['optionId' => $size->id, 'value' => 'L']]);

        $this->assertSame(
            [BookingChangeKind::Created, BookingChangeKind::Changed],
            BookingChange::orderBy('id')->pluck('change')->all(),
        );
    }

    public function test_a_member_renamed_since_booking_records_changed_once(): void
    {
        // The row's name follows the account on every write, and the answers
        // change too: one booking moved, so one row.
        [$event, $meal, $size] = $this->membersForm();
        $anna = Member::factory()->named('Anna', 'Muster')->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1], ['optionId' => $size->id, 'value' => 'M']]);
        $anna->update(['last_name' => 'Brügger']);

        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1], ['optionId' => $size->id, 'value' => 'S']]);

        $this->assertSame(1, BookingChange::where('change', BookingChangeKind::Changed)->count());
    }

    public function test_a_committee_correction_records_changed_by_the_corrector(): void
    {
        $booking = Registration::factory()->create(['first_name' => 'Jean']);
        $paul = Member::factory()->named('Paul', 'Direction', 'paul')->administrator()->create();
        BookingChange::query()->delete();

        $this->actingAsMember($paul)
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['firstName' => 'Jeanne'])
            ->assertOk();

        $row = BookingChange::sole();
        $this->assertSame(BookingChangeKind::Changed, $row->change);
        $this->assertSame($paul->id, $row->actor_member_id);
        $this->assertSame('Paul Direction', $row->actor_label);
    }

    public function test_ticking_paid_records_nothing(): void
    {
        $booking = Registration::factory()->create();
        BookingChange::query()->delete();

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['paid' => true])
            ->assertOk();

        $this->assertSame(0, BookingChange::count());
    }

    public function test_a_committee_cancellation_records_cancelled(): void
    {
        $booking = Registration::factory()->create();
        BookingChange::query()->delete();

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('registration', $booking))
            ->deleteJson("/api/v1/registrations/{$booking->id}")
            ->assertOk();

        $row = BookingChange::sole();
        $this->assertSame(BookingChangeKind::Cancelled, $row->change);
        $this->assertSame($booking->id, $row->registration_id);
        $this->assertSame($booking->event_id, $row->event_id);
    }

    public function test_a_member_withdrawing_records_cancelled(): void
    {
        [$event, $meal] = $this->membersForm();
        $anna = Member::factory()->create();
        $this->bookAs($anna, $event, [['optionId' => $meal->id, 'quantity' => 1]]);

        $this->actingAsMember($anna)->deleteJson("/api/v1/events/{$event->id}/my-registration")->assertOk();

        $this->assertSame(
            [BookingChangeKind::Created, BookingChangeKind::Cancelled],
            BookingChange::orderBy('id')->pluck('change')->all(),
        );
    }

    public function test_a_refused_booking_records_nothing(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $meal = RegistrationOption::factory()->create(['event_id' => $event->id, 'capacity' => 1]);

        $this->bookPublicly($event, [['optionId' => $meal->id, 'quantity' => 2]])->assertStatus(400);

        $this->assertSame(0, BookingChange::count());
    }

    public function test_a_rolled_back_booking_records_nothing(): void
    {
        // The journal is written after commit, so its ids follow commit order
        // and a write that never happened leaves no trace.
        $event = Event::factory()->takingRegistrations()->create();

        try {
            DB::transaction(function () use ($event): void {
                Registration::factory()->create(['event_id' => $event->id]);

                throw new RuntimeException('refused after the insert');
            });
        } catch (RuntimeException) {
        }

        $this->assertSame(0, Registration::count());
        $this->assertSame(0, BookingChange::count());
    }

    public function test_the_row_is_written_when_the_booking_commits(): void
    {
        // Not before: a row written inside the transaction would take its id
        // early, and a later-committing booking could slip under a read mark.
        $event = Event::factory()->takingRegistrations()->create();

        DB::transaction(function () use ($event): void {
            Registration::factory()->create(['event_id' => $event->id]);

            $this->assertSame(0, BookingChange::count());
        });

        $this->assertSame(1, BookingChange::count());
    }

    public function test_deleting_the_event_removes_its_journal(): void
    {
        $booking = Registration::factory()->create();
        $this->assertSame(1, BookingChange::count());

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('event', $booking->event))
            ->deleteJson("/api/v1/events/{$booking->event_id}")
            ->assertSuccessful();

        $this->assertSame(0, BookingChange::count());
    }

    /**
     * A members-only form with a quantity block and a text block.
     *
     * @return array{Event, RegistrationOption, RegistrationOption}
     */
    private function membersForm(): array
    {
        $event = Event::factory()->takingRegistrations()->create(['registration_audience' => FormAudience::Members]);

        return [
            $event,
            RegistrationOption::factory()->create(['event_id' => $event->id]),
            RegistrationOption::factory()->kind(OptionKind::Text)->create(['event_id' => $event->id, 'label' => 'Taille']),
        ];
    }

    /** @param  list<array<string, mixed>>  $choices */
    private function bookAs(Member $member, Event $event, array $choices): void
    {
        $this->actingAsMember($member)
            ->putJson("/api/v1/events/{$event->id}/my-registration", ['choices' => $choices])
            ->assertSuccessful();
    }

    /** @param  list<array<string, mixed>>  $choices */
    private function bookPublicly(Event $event, array $choices): TestResponse
    {
        return $this->postJson(
            "/api/v1/events/{$event->id}/registrations",
            $this->publicWriteBody([
                'firstName' => 'Delphine',
                'lastName' => 'Maillard',
                'email' => 'delphine@example.test',
                'phone' => '079 322 12 57',
                'choices' => $choices,
            ]),
            $this->publicWriteHeaders(),
        );
    }
}

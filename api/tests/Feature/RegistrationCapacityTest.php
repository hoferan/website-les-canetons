<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * How many of an option can be booked in all (#114, ADR 0031): the public
 * form's places left, the refusal when they run out, and the committee
 * setting the number.
 */
class RegistrationCapacityTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    private RegistrationOption $meat;

    private RegistrationOption $child;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->event = Event::factory()->takingRegistrations()->create(['title' => 'Souper de soutien']);
        $this->meat = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
        $this->child = RegistrationOption::factory()->labelled('Menu enfant', 2000)
            ->create(['event_id' => $this->event->id, 'sort_order' => 1]);
    }

    /** Books directly, the way an earlier guest already has. */
    private function alreadyBooked(RegistrationOption $option, int $quantity): void
    {
        $booking = Registration::factory()->create(['event_id' => $this->event->id]);

        RegistrationChoice::create([
            'registration_id' => $booking->id,
            'option_id' => $option->id,
            'quantity' => $quantity,
        ]);
    }

    /** @param list<array{optionId: int, quantity: int}> $choices */
    private function book(array $choices): TestResponse
    {
        return $this->postJson(
            "/api/v1/events/{$this->event->id}/registrations",
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

    private function form(): TestResponse
    {
        return $this->getJson("/api/v1/events/{$this->event->id}/registration");
    }

    // ------------------------------------------------------- the form

    public function test_an_option_without_a_capacity_has_no_places_left_to_count(): void
    {
        $this->form()
            ->assertOk()
            ->assertJsonPath('options.0.capacity', null)
            ->assertJsonPath('options.0.remaining', null);
    }

    public function test_the_form_says_how_many_places_are_left(): void
    {
        $this->meat->update(['capacity' => 10]);
        $this->alreadyBooked($this->meat, 3);
        $this->alreadyBooked($this->meat, 4);

        $this->form()
            ->assertJsonPath('options.0.capacity', 10)
            ->assertJsonPath('options.0.remaining', 3);
    }

    public function test_a_capacity_lowered_below_the_bookings_reads_as_sold_out_not_negative(): void
    {
        // The committee may cut the number after people have booked, to stop
        // further bookings. Nobody's booking is touched.
        $this->alreadyBooked($this->meat, 6);
        $this->meat->update(['capacity' => 4]);

        $this->form()->assertJsonPath('options.0.remaining', 0);
    }

    // ---------------------------------------------------- booking

    public function test_exactly_the_places_left_can_be_booked(): void
    {
        $this->meat->update(['capacity' => 10]);
        $this->alreadyBooked($this->meat, 7);

        $this->book([['optionId' => $this->meat->id, 'quantity' => 3]])->assertStatus(201);

        $this->form()->assertJsonPath('options.0.remaining', 0);
    }

    public function test_one_more_than_the_places_left_is_refused_against_that_option(): void
    {
        $this->child->update(['capacity' => 10]);
        $this->alreadyBooked($this->child, 7);

        // The capped option second, so the field names its position in
        // `choices`, not in the event's options.
        $this->book([
            ['optionId' => $this->meat->id, 'quantity' => 2],
            ['optionId' => $this->child->id, 'quantity' => 4],
        ])
            ->assertStatus(400)
            ->assertJsonPath('code', 'validation_failed')
            ->assertJsonPath('errors.0.field', 'choices.1.quantity')
            ->assertJsonPath('errors.0.reason', 'not_enough_places');

        // All or nothing: the uncapped line is not kept either.
        $this->assertSame(1, Registration::query()->count());
    }

    public function test_a_sold_out_option_refuses_even_one(): void
    {
        $this->meat->update(['capacity' => 2]);
        $this->alreadyBooked($this->meat, 2);

        $this->book([['optionId' => $this->meat->id, 'quantity' => 1]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.reason', 'not_enough_places');
    }

    public function test_a_capped_option_does_not_cap_the_others(): void
    {
        $this->meat->update(['capacity' => 1]);
        $this->alreadyBooked($this->meat, 1);

        $this->book([['optionId' => $this->child->id, 'quantity' => 5]])->assertStatus(201);
    }

    public function test_a_booking_of_a_capped_option_locks_the_event_before_reading_anything(): void
    {
        // The race ADR 0020 named: two guests both read one place left and
        // both insert. The count has to be taken under a lock the other
        // booking waits on, and the lock has to open the transaction: InnoDB
        // fixes the snapshot at the first plain read, so a read before the
        // lock would count against a stale one and the race would remain.
        $this->meat->update(['capacity' => 10]);

        $log = $this->statementsDuring(fn () => $this->book([['optionId' => $this->meat->id, 'quantity' => 1]])->assertStatus(201));

        $lock = array_search(true, array_map(self::locksTheEvent(...), $log), true);

        $this->assertIsInt($lock, 'No lock on the event while booking a capped option.');
        $this->assertSame('BEGIN', $log[$lock - 1] ?? null, 'The event lock is not the first statement of its transaction.');
    }

    public function test_a_booking_of_uncapped_options_takes_no_lock(): void
    {
        // An event with no capacity anywhere keeps the lock-free path ADR 0020
        // chose for the one endpoint strangers can hammer.
        $log = $this->statementsDuring(fn () => $this->book([['optionId' => $this->meat->id, 'quantity' => 1]])->assertStatus(201));

        $this->assertSame([], array_values(array_filter($log, self::locksTheEvent(...))));
    }

    private static function locksTheEvent(string $statement): bool
    {
        $statement = strtolower($statement);

        return str_contains($statement, 'from `events`') && str_contains($statement, 'for update');
    }

    /**
     * Every query run, with `BEGIN` where a transaction (or, under
     * RefreshDatabase, a savepoint) opened.
     *
     * @return list<string>
     */
    private function statementsDuring(callable $act): array
    {
        $log = [];
        DB::listen(function (QueryExecuted $query) use (&$log): void {
            $log[] = $query->sql;
        });
        $this->app['events']->listen(TransactionBeginning::class, function () use (&$log): void {
            $log[] = 'BEGIN';
        });

        $act();

        return $log;
    }

    // ------------------------------------------------- the committee

    public function test_the_committee_sets_and_clears_a_capacity(): void
    {
        $organiser = Member::factory()->administrator()->create();

        $this->actingAsMember($organiser)
            ->withHeaders($this->ifMatch('event.options', $this->event))
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [
                    ['id' => $this->meat->id, 'label' => 'Menu viande', 'priceCents' => 4500, 'capacity' => 120],
                    ['id' => $this->child->id, 'label' => 'Menu enfant', 'priceCents' => 2000, 'capacity' => null],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.0.capacity', 120)
            ->assertJsonPath('data.0.remaining', 120)
            ->assertJsonPath('data.1.capacity', null);

        $this->assertSame(120, $this->meat->fresh()->capacity);
        $this->assertNull($this->child->fresh()->capacity);
    }

    public function test_leaving_capacity_out_clears_it_like_every_other_optional_field(): void
    {
        // Replace-all: an entry is the whole option, so an omitted capacity is
        // no capacity, as an omitted description is no description.
        $organiser = Member::factory()->administrator()->create();
        $this->meat->update(['capacity' => 50]);

        $this->actingAsMember($organiser)
            ->withHeaders($this->ifMatch('event.options', $this->event))
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [['id' => $this->meat->id, 'label' => 'Menu viande']],
            ])
            ->assertOk();

        $this->assertNull($this->meat->fresh()->capacity);
    }

    public function test_a_capacity_must_be_a_positive_whole_number(): void
    {
        // Zero would be an option nobody can book, which is a removed option.
        $organiser = Member::factory()->administrator()->create();

        $this->actingAsMember($organiser)
            ->withHeaders($this->ifMatch('event.options', $this->event))
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [['id' => $this->meat->id, 'label' => 'Menu viande', 'capacity' => 0]],
            ])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.capacity');
    }

    public function test_a_booking_meanwhile_does_not_stale_the_committees_edit(): void
    {
        // `remaining` moves with every booking. In the options tag it would
        // make the editor's save 412 whenever a guest booked while it was open.
        $organiser = Member::factory()->administrator()->create();
        $this->meat->update(['capacity' => 10]);
        $openedWith = $this->ifMatch('event.options', $this->event);

        $this->alreadyBooked($this->meat, 2);

        $this->actingAsMember($organiser)
            ->withHeaders($openedWith)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [['id' => $this->meat->id, 'label' => 'Menu viande', 'capacity' => 12]],
            ])
            ->assertOk()
            ->assertJsonPath('data.0.remaining', 10);
    }
}

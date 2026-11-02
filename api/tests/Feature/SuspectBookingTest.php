<?php

namespace Tests\Feature;

use App\Mail\RegistrationConfirmation;
use App\Models\BookingChange;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Support\OptionKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A public booking whose text carries a link or markup is stored flagged
 * (#332, ADR 0037): its table stays off the public form and its confirmation
 * waits until somebody with `registrations.manage` clears the flag.
 */
class SuspectBookingTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    private RegistrationOption $meat;

    private RegistrationOption $allergies;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->event = Event::factory()->takingRegistrations()->create(['registration_asks_table' => true]);
        $this->meat = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
        $this->allergies = RegistrationOption::factory()->kind(OptionKind::Text)
            ->create(['event_id' => $this->event->id, 'label' => 'Allergies', 'sort_order' => 1]);
    }

    // ------------------------------------------------------- at submission

    public function test_a_link_in_the_table_flags_the_booking_and_holds_its_mail(): void
    {
        $this->book(['tableName' => 'www.cheap-pills.example'])
            ->assertCreated()
            ->assertJsonPath('suspectFields', ['tableName']);

        $this->assertSame(['tableName'], Registration::sole()->suspect_fields);
        Mail::assertNothingSent();
    }

    public function test_a_clean_booking_is_not_flagged_and_is_mailed(): void
    {
        $this->book(['tableName' => 'Famille Müller'])
            ->assertCreated()
            ->assertJsonPath('suspectFields', []);

        $this->assertNull(Registration::sole()->suspect_fields);
        Mail::assertSent(RegistrationConfirmation::class, 1);
    }

    public function test_every_text_field_is_checked_and_named(): void
    {
        $this->book([
            'firstName' => '<b>Bob</b>',
            'address' => 'http://x.example',
            'choices' => [
                ['optionId' => $this->meat->id, 'quantity' => 1],
                ['optionId' => $this->allergies->id, 'value' => '[url=x.example]x[/url]'],
            ],
        ])->assertJsonPath('suspectFields', ['firstName', 'address', 'answers']);
    }

    public function test_a_flagged_table_stays_off_the_public_form(): void
    {
        $this->book(['tableName' => 'www.cheap-pills.example']);

        $this->form()->assertJsonPath('tables', []);
    }

    public function test_a_shared_table_lists_only_the_unflagged_guests(): void
    {
        // A spammer who picks a real family's table must not hide it, and
        // must not add to its head count either.
        Registration::factory()->withChoice($this->meat, 3)
            ->create(['event_id' => $this->event->id, 'table_name' => 'Müller']);
        Registration::factory()->withChoice($this->meat, 2)
            ->create(['event_id' => $this->event->id, 'table_name' => 'Müller', 'suspect_fields' => ['lastName']]);

        $this->form()->assertJsonPath('tables', [['name' => 'Müller', 'guests' => 3]]);
    }

    // -------------------------------------------------------- the clearing

    public function test_clearing_the_flag_sends_the_held_mail_and_lists_the_table(): void
    {
        $booking = $this->flagged();

        $this->clear($booking, Member::factory()->administrator()->create())
            ->assertOk()
            ->assertJsonPath('suspectFields', []);

        $this->assertNull($booking->refresh()->suspect_fields);
        Mail::assertSent(RegistrationConfirmation::class, fn (RegistrationConfirmation $mail) => $mail->hasTo('guest@example.test'));
        $this->form()->assertJsonPath('tables', [['name' => 'www.x.example', 'guests' => 2]]);
    }

    public function test_clearing_an_unflagged_booking_sends_nothing(): void
    {
        $booking = Registration::factory()->withChoice($this->meat, 2)->create(['event_id' => $this->event->id]);

        $this->clear($booking, Member::factory()->administrator()->create())->assertOk();

        Mail::assertNothingSent();
    }

    public function test_clearing_the_flag_is_not_a_booking_change(): void
    {
        // The journal feeds the inbox's "new" and "changed" counts; a flag
        // cleared would otherwise raise the event's item again.
        $booking = $this->flagged();
        $before = BookingChange::query()->count();

        $this->clear($booking, Member::factory()->administrator()->create())->assertOk();

        $this->assertSame($before, BookingChange::query()->count());
    }

    public function test_nobody_can_flag_a_booking_by_hand(): void
    {
        $booking = Registration::factory()->withChoice($this->meat, 2)->create(['event_id' => $this->event->id]);

        $this->actingAsMember(Member::factory()->administrator()->create())
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['suspect' => true])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'suspect');

        $this->assertNull($booking->refresh()->suspect_fields);
    }

    public function test_reading_the_guest_list_is_not_enough_to_clear_a_flag(): void
    {
        $booking = $this->flagged();

        $this->clear($booking, Member::factory()->committee()->create())->assertForbidden();

        $this->assertSame(['tableName'], $booking->refresh()->suspect_fields);
        Mail::assertNothingSent();
    }

    // ------------------------------------------------------------- helpers

    private function book(array $overrides): TestResponse
    {
        return $this->withHeaders($this->publicWriteHeaders())->postJson(
            "/api/v1/events/{$this->event->id}/registrations",
            array_merge($this->publicWriteBody([
                'firstName' => 'Delphine',
                'lastName' => 'Maillard',
                'email' => 'delphine@example.test',
                'phone' => '079 322 12 57',
                'address' => null,
                'tableName' => null,
                'choices' => [['optionId' => $this->meat->id, 'quantity' => 2]],
            ]), $overrides),
        );
    }

    private function form(): TestResponse
    {
        return $this->getJson("/api/v1/events/{$this->event->id}/registration")->assertOk();
    }

    private function flagged(): Registration
    {
        return Registration::factory()->withChoice($this->meat, 2)->create([
            'event_id' => $this->event->id,
            'email' => 'guest@example.test',
            'table_name' => 'www.x.example',
            'suspect_fields' => ['tableName'],
        ]);
    }

    private function clear(Registration $booking, Member $as): TestResponse
    {
        return $this->actingAsMember($as)
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['suspect' => false]);
    }
}

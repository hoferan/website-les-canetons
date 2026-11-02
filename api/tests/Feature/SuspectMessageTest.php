<?php

namespace Tests\Feature;

use App\Mail\ContactMessageReceived;
use App\Models\BookingChange;
use App\Models\ContactMessage;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\Role;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A contact message whose text carries a link or markup is stored flagged
 * (#332, ADR 0037), and the inbox says so for messages and bookings alike.
 */
class SuspectMessageTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_link_in_the_message_flags_it_and_the_committee_is_still_told(): void
    {
        Mail::fake();

        $this->postJson('/api/v1/contact', $this->publicWriteBody([
            'lastName' => 'Sender',
            'firstName' => 'Spam',
            'email' => 'spam@example.test',
            'subject' => 'Offer',
            'message' => 'Visit https://cheap.example now',
        ]), $this->publicWriteHeaders())->assertOk();

        $this->assertSame(['message'], ContactMessage::sole()->suspect_fields);
        Mail::assertSent(ContactMessageReceived::class, 1);
    }

    public function test_a_clean_message_is_not_flagged(): void
    {
        $this->postJson('/api/v1/contact', $this->publicWriteBody([
            'lastName' => 'Lovelace',
            'firstName' => 'Ada',
            'email' => 'ada@example.test',
            'subject' => 'Bonjour',
            'message' => 'Jouez-vous le 3 mars ?',
        ]), $this->publicWriteHeaders())->assertOk();

        $this->assertNull(ContactMessage::sole()->suspect_fields);
    }

    public function test_the_message_carries_its_flagged_fields(): void
    {
        $message = ContactMessage::factory()->create(['suspect_fields' => ['subject', 'message']]);

        $this->actingAsMember($this->committeeMember())
            ->getJson("/api/v1/contact-messages/{$message->id}")
            ->assertOk()
            ->assertJsonPath('suspectFields', ['subject', 'message']);
    }

    public function test_clearing_the_flag_leaves_the_message_open(): void
    {
        $message = ContactMessage::factory()->create(['suspect_fields' => ['message']]);

        $this->clearOrHandle($message, ['suspect' => false], $this->directionMember())
            ->assertOk()
            ->assertJsonPath('suspectFields', [])
            ->assertJsonPath('handledAt', null);

        $this->assertNull($message->refresh()->suspect_fields);
    }

    public function test_reading_the_inbox_is_not_enough_to_clear_a_flag(): void
    {
        $message = ContactMessage::factory()->create(['suspect_fields' => ['message']]);

        $this->clearOrHandle($message, ['suspect' => false], $this->committeeMember())->assertForbidden();
    }

    public function test_nobody_can_flag_a_message_by_hand(): void
    {
        $message = ContactMessage::factory()->create();

        $this->clearOrHandle($message, ['suspect' => true], $this->directionMember())
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'suspect');
    }

    public function test_an_empty_patch_still_asks_for_handled(): void
    {
        $message = ContactMessage::factory()->create();

        $this->clearOrHandle($message, [], $this->directionMember())
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'handled')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_the_inbox_marks_a_flagged_message(): void
    {
        ContactMessage::factory()->create(['suspect_fields' => ['message']]);

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'contactMessage')
            ->assertJsonPath('data.0.suspect', true);
    }

    public function test_the_inbox_counts_an_events_flagged_bookings(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id]);
        Registration::factory()->create(['event_id' => $event->id, 'suspect_fields' => ['tableName']]);

        $this->actingAsMember($this->committeeMember())
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'eventBookings')
            ->assertJsonPath('data.0.suspect', false)
            ->assertJsonPath('data.0.facts.suspect', 1);
    }

    public function test_a_flagged_booking_keeps_its_event_in_the_inbox_once_the_list_is_read(): void
    {
        // The read mark is shared and needs only registrations.view, so a
        // reader would otherwise close the item before anybody who can clear
        // the flag, and send the held mail, has seen it.
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id, 'suspect_fields' => ['tableName']]);
        $camille = $this->committeeMember();

        $this->actingAsMember($camille)
            ->putJson("/api/v1/events/{$event->id}/booking-read", ['upTo' => (int) BookingChange::max('id')])
            ->assertSuccessful();

        $this->actingAsMember($camille)
            ->getJson('/api/v1/inbox')
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'eventBookings')
            ->assertJsonPath('data.0.facts.changes.new', 0)
            ->assertJsonPath('data.0.facts.suspect', 1);
    }

    public function test_a_read_list_with_nothing_flagged_leaves_the_inbox(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        Registration::factory()->create(['event_id' => $event->id]);
        $camille = $this->committeeMember();

        $this->actingAsMember($camille)
            ->putJson("/api/v1/events/{$event->id}/booking-read", ['upTo' => (int) BookingChange::max('id')])
            ->assertSuccessful();

        $this->actingAsMember($camille)->getJson('/api/v1/inbox')->assertJsonPath('data', []);
    }

    private function clearOrHandle(ContactMessage $message, array $body, Member $as): TestResponse
    {
        return $this->actingAsMember($as)->patchJson(
            "/api/v1/contact-messages/{$message->id}",
            $body,
            $this->ifMatch('contact_message', $message),
        );
    }

    private function committeeMember(): Member
    {
        $camille = Member::factory()->named('Camille', 'Committee', 'camille')->create();
        $camille->roles()->attach(Role::where('key', 'committee')->sole());

        return $camille;
    }

    private function directionMember(): Member
    {
        $dominique = Member::factory()->named('Dominique', 'Direction', 'dominique')->create();
        $dominique->roles()->attach(Role::where('key', 'direction')->sole());

        return $dominique;
    }
}

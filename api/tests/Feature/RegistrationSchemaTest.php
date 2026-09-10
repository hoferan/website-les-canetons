<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Support\Permission;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RegistrationSchemaTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_is_enabled_by_the_close_date_alone(): void
    {
        // D9: no separate boolean. A flag beside a date is a flag that
        // drifts out of step with it, which is what the retired `weekend`
        // column did.
        $this->assertFalse(Event::factory()->create()->takesRegistrations());
        $this->assertTrue(Event::factory()->takingRegistrations()->create()->takesRegistrations());
    }

    public function test_a_missing_open_date_means_open_now(): void
    {
        // So the committee can enable an event without also deciding when
        // the form should appear.
        $event = Event::factory()->takingRegistrations()->create();

        $this->assertNull($event->registration_opens_at);
        $this->assertTrue($event->registrationIsOpen());
    }

    public function test_the_window_has_both_ends(): void
    {
        $this->assertFalse(Event::factory()->registrationNotYetOpen()->create()->registrationIsOpen());
        $this->assertFalse(Event::factory()->registrationClosed()->create()->registrationIsOpen());
    }

    public function test_an_event_that_takes_none_is_never_open(): void
    {
        $this->assertFalse(Event::factory()->create()->registrationIsOpen());
    }

    public function test_a_booking_may_take_an_option_only_once(): void
    {
        // "3 x meat" is ONE row with a quantity, not three rows — which is
        // what makes a total a SUM rather than a COUNT over a text column.
        $option = RegistrationOption::factory()->create();
        $booking = Registration::factory()->withChoice($option, 2)->create([
            'event_id' => $option->event_id,
        ]);

        $this->expectException(QueryException::class);

        RegistrationChoice::create([
            'registration_id' => $booking->id,
            'option_id' => $option->id,
            'quantity' => 1,
        ]);
    }

    public function test_deleting_a_booking_takes_its_choices(): void
    {
        $option = RegistrationOption::factory()->create();
        $booking = Registration::factory()->withChoice($option)->create(['event_id' => $option->event_id]);

        $booking->delete();

        $this->assertSame(0, RegistrationChoice::query()->count());
        // But the option survives: it belongs to the event, not the booking.
        $this->assertSame(1, RegistrationOption::query()->count());
    }

    public function test_a_booked_option_cannot_be_deleted(): void
    {
        // RESTRICT, not CASCADE. Deleting an option people have already
        // booked would silently rewrite what those people ordered.
        $option = RegistrationOption::factory()->create();
        Registration::factory()->withChoice($option)->create(['event_id' => $option->event_id]);

        $this->assertTrue($option->fresh()->isBooked());

        $this->expectException(QueryException::class);
        $option->delete();
    }

    public function test_an_unbooked_option_deletes_freely(): void
    {
        $option = RegistrationOption::factory()->create();

        $this->assertFalse($option->isBooked());
        $option->delete();

        $this->assertSame(0, RegistrationOption::query()->count());
    }

    public function test_deleting_the_event_takes_the_whole_booking_tree(): void
    {
        $option = RegistrationOption::factory()->create();
        Registration::factory()->withChoice($option)->create(['event_id' => $option->event_id]);

        Event::query()->findOrFail($option->event_id)->delete();

        $this->assertSame(0, Registration::query()->count());
        $this->assertSame(0, RegistrationOption::query()->count());
        $this->assertSame(0, RegistrationChoice::query()->count());
    }

    public function test_deleting_the_event_reports_both_cascades(): void
    {
        // The confirmation dialog names the damage rather than merely asking
        // again. Attendance and registrations are counted separately because
        // they are different losses to the reader.
        $organiser = Member::factory()->administrator()->create();
        $option = RegistrationOption::factory()->create();
        Registration::factory()->withChoice($option)->create(['event_id' => $option->event_id]);
        Registration::factory()->withChoice($option)->create(['event_id' => $option->event_id]);

        $this->actingAsMember($organiser)
            ->deleteJson("/api/events/{$option->event_id}")
            ->assertOk()
            ->assertJson(['ok' => true, 'attendanceDeleted' => 0, 'registrationsDeleted' => 2]);

        $this->assertSame(0, Registration::query()->count());
    }

    public function test_the_guest_count_sums_the_quantities(): void
    {
        // "3 x meat, 1 x child" is four people, which is what
        // registration_max_guests caps.
        $event = Event::factory()->takingRegistrations()->create();
        $meat = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $child = RegistrationOption::factory()->labelled('Menu enfant', 2000)->create(['event_id' => $event->id]);

        $booking = Registration::factory()
            ->withChoice($meat, 3)
            ->withChoice($child, 1)
            ->create(['event_id' => $event->id]);

        $this->assertSame(4, $booking->load('choices')->guest_count);
    }

    public function test_the_total_is_computed_in_centimes(): void
    {
        // The whole reason price_cents is an integer rather than the
        // sketch's pre-formatted string: 3 x 45.- plus 1 x 20.- is a number
        // the committee checks against the cash box.
        $event = Event::factory()->takingRegistrations()->create();
        $meat = RegistrationOption::factory()->create(['event_id' => $event->id]);
        $child = RegistrationOption::factory()->labelled('Menu enfant', 2000)->create(['event_id' => $event->id]);

        $booking = Registration::factory()
            ->withChoice($meat, 3)
            ->withChoice($child, 1)
            ->create(['event_id' => $event->id]);

        $this->assertSame(15_500, $booking->load('choices.option')->total_cents);
    }

    public function test_a_booking_of_unpriced_options_totals_null_not_zero(): void
    {
        // Null rather than zero, and the difference is the point: a free
        // event owes nothing, an event whose prices live in the descriptions
        // owes an unknown amount, and "CHF 0.-" would assert the first about
        // the second.
        $option = RegistrationOption::factory()->free()->create();
        $booking = Registration::factory()->withChoice($option, 2)->create(['event_id' => $option->event_id]);

        $this->assertNull($booking->load('choices.option')->total_cents);
    }

    public function test_registrations_manage_is_granted_to_direction(): void
    {
        $roleId = DB::table('roles')->where('key', 'direction')->value('id');

        $this->assertTrue(
            DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission', Permission::RegistrationsManage->value)
                ->exists()
        );
    }

    public function test_committee_is_not_quietly_given_the_power_to_delete_bookings(): void
    {
        // The role exists so somebody can LOOK at the guest list. Widening
        // registrations.view would have handed it deletion instead.
        $roleId = DB::table('roles')->where('key', 'committee')->value('id');

        $permissions = DB::table('role_permissions')->where('role_id', $roleId)
            ->pluck('permission')->all();

        $this->assertSame([Permission::RegistrationsView->value], $permissions);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Support\FormAudience;
use App\Support\OptionKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The committee corrects a booking's answers on the guest list (#317): text,
 * choice and yes/no, through the booking PATCH. Quantities stay as booked.
 */
class RegistrationAnswerCorrectionTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    private Event $event;

    private RegistrationOption $meal;

    private RegistrationOption $allergies;

    private RegistrationOption $size;

    private RegistrationOption $veggie;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
        $this->event = Event::factory()->takingRegistrations()->create();
        $this->meal = RegistrationOption::factory()->create(['event_id' => $this->event->id, 'sort_order' => 0]);
        $this->allergies = $this->block(OptionKind::Text, 'Allergies', 1);
        $this->size = RegistrationOption::factory()->choiceOf(['S', 'M'])
            ->create(['event_id' => $this->event->id, 'sort_order' => 2]);
        $this->veggie = $this->block(OptionKind::YesNo, 'Végétarien ?', 3);
    }

    public function test_each_answer_kind_can_be_corrected(): void
    {
        $booking = $this->booking(['allergies' => 'Rien', 'size' => 's', 'veggie' => 'no']);

        $this->correct($booking, [
            ['optionId' => $this->allergies->id, 'value' => 'Noix'],
            ['optionId' => $this->size->id, 'value' => 'm'],
            ['optionId' => $this->veggie->id, 'value' => 'yes'],
        ])->assertOk();

        $this->assertSame(
            [$this->allergies->id => 'Noix', $this->size->id => 'm', $this->veggie->id => 'yes'],
            $this->answersOf($booking),
        );
    }

    public function test_the_quantities_stay_as_booked(): void
    {
        $booking = $this->booking(['allergies' => 'Rien']);

        $this->correct($booking, [['optionId' => $this->allergies->id, 'value' => 'Noix']])
            ->assertOk()
            ->assertJsonPath('guestCount', 2);

        $this->assertSame(2, (int) $booking->choices()->where('option_id', $this->meal->id)->value('quantity'));
    }

    public function test_a_quantity_cannot_be_changed_this_way(): void
    {
        $booking = $this->booking();

        $this->correct($booking, [['optionId' => $this->meal->id, 'value' => '5']])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices.0.value')
            ->assertJsonPath('errors.0.reason', 'not_an_answer');

        $this->correct($booking, [['optionId' => $this->meal->id, 'quantity' => 5]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices.0.value')
            ->assertJsonPath('errors.0.reason', 'not_an_answer');

        $this->assertSame(2, (int) $booking->choices()->sum('quantity'));
    }

    public function test_an_answer_left_out_is_cleared(): void
    {
        $booking = $this->booking(['allergies' => 'Rien', 'veggie' => 'no']);

        $this->correct($booking, [['optionId' => $this->veggie->id, 'value' => 'yes']])->assertOk();

        $this->assertSame([$this->veggie->id => 'yes'], $this->answersOf($booking));
    }

    public function test_a_patch_without_choices_leaves_the_answers_alone(): void
    {
        $booking = $this->booking(['allergies' => 'Rien']);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['tableName' => 'Table 3'])
            ->assertOk();

        $this->assertSame([$this->allergies->id => 'Rien'], $this->answersOf($booking));
    }

    public function test_an_answer_its_block_does_not_take_is_refused(): void
    {
        $booking = $this->booking(['size' => 's']);

        $this->correct($booking, [['optionId' => $this->size->id, 'value' => 'xl']])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices.0.value')
            ->assertJsonPath('errors.0.reason', 'not_an_answer');

        $this->correct($booking, [['optionId' => $this->veggie->id, 'value' => 'peut-être']])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.reason', 'not_an_answer');

        $this->assertSame([$this->size->id => 's'], $this->answersOf($booking));
    }

    public function test_a_required_block_must_stay_answered(): void
    {
        $this->allergies->update(['required' => true]);
        $booking = $this->booking(['allergies' => 'Rien']);

        $this->correct($booking, [['optionId' => $this->allergies->id, 'value' => '  ']])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', "answers.{$this->allergies->id}")
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_the_people_count_is_not_checked_again(): void
    {
        // The answers carry no quantity, so the public form's "at least one
        // person" would refuse every correction.
        $booking = $this->booking(['allergies' => 'Rien']);

        $this->correct($booking, [['optionId' => $this->allergies->id, 'value' => 'Noix']])->assertOk();
    }

    public function test_another_events_block_is_refused(): void
    {
        $elsewhere = RegistrationOption::factory()->kind(OptionKind::Text)
            ->create(['event_id' => Event::factory()->takingRegistrations()->create()->id]);
        $booking = $this->booking();

        $this->correct($booking, [['optionId' => $elsewhere->id, 'value' => 'x']])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'choices.0.optionId');
    }

    public function test_a_closed_form_can_still_be_corrected(): void
    {
        // Correcting after the window is the point: the guest can no longer
        // cancel and book again.
        $booking = $this->booking(['allergies' => 'Rien']);
        $this->event->update(['registration_closes_at' => now()->subDay()]);

        $this->correct($booking, [['optionId' => $this->allergies->id, 'value' => 'Noix']])->assertOk();
    }

    public function test_a_members_answers_can_be_corrected(): void
    {
        $this->event->update(['registration_audience' => FormAudience::Members]);
        $member = Member::factory()->named('Anna', 'Muster')->create();
        $booking = $this->booking(['allergies' => 'Rien'], $member);

        $this->correct($booking, [['optionId' => $this->allergies->id, 'value' => 'Noix']])->assertOk();

        $this->assertSame([$this->allergies->id => 'Noix'], $this->answersOf($booking));
    }

    public function test_a_members_own_change_makes_the_committees_tag_stale(): void
    {
        // The committee opened the panel, then the member changed their
        // answer: saving the panel would undo it without anyone seeing it.
        $this->event->update(['registration_audience' => FormAudience::Members]);
        $member = Member::factory()->create();
        $booking = $this->booking(['allergies' => 'Rien'], $member);
        $opened = $this->ifMatch('registration', $booking);

        $this->actingAsMember($member)
            ->putJson("/api/v1/events/{$this->event->id}/my-registration", ['choices' => [
                ['optionId' => $this->meal->id, 'quantity' => 2],
                ['optionId' => $this->allergies->id, 'value' => 'Gluten'],
            ]])
            ->assertOk();

        $this->actingAsMember($this->organiser)
            ->withHeaders($opened)
            ->patchJson("/api/v1/registrations/{$booking->id}", ['choices' => [
                ['optionId' => $this->allergies->id, 'value' => 'Noix'],
            ]])
            ->assertStatus(412);

        $this->assertSame([$this->allergies->id => 'Gluten'], $this->answersOf($booking));
    }

    public function test_a_members_change_locks_the_booking_row(): void
    {
        // Without the lock, the committee's conditional write checks its tag
        // while the member's change is still uncommitted, passes, and then
        // overwrites it.
        $this->event->update(['registration_audience' => FormAudience::Members]);
        $member = Member::factory()->create();
        $this->booking([], $member);

        $locking = [];
        DB::listen(function ($query) use (&$locking): void {
            if (str_contains($query->sql, 'from `registrations`') && str_contains($query->sql, 'for update')) {
                $locking[] = $query->sql;
            }
        });

        $this->actingAsMember($member)
            ->putJson("/api/v1/events/{$this->event->id}/my-registration", ['choices' => [
                ['optionId' => $this->meal->id, 'quantity' => 1],
            ]])
            ->assertOk();

        $this->assertNotEmpty($locking);
    }

    /** @param  list<array<string, mixed>>  $choices */
    private function correct(Registration $booking, array $choices): TestResponse
    {
        return $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('registration', $booking))
            ->patchJson("/api/v1/registrations/{$booking->id}", ['choices' => $choices]);
    }

    /** @param  array<string, string>  $answers  keyed allergies, size, veggie */
    private function booking(array $answers = [], ?Member $member = null): Registration
    {
        $booking = Registration::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $member?->id,
        ]);

        RegistrationChoice::create([
            'registration_id' => $booking->id,
            'option_id' => $this->meal->id,
            'quantity' => 2,
        ]);

        foreach ($answers as $block => $value) {
            RegistrationChoice::create([
                'registration_id' => $booking->id,
                'option_id' => $this->{$block}->id,
                'value' => $value,
            ]);
        }

        return $booking;
    }

    /** @return array<int, string> */
    private function answersOf(Registration $booking): array
    {
        return $booking->choices()->whereNull('quantity')->orderBy('option_id')
            ->pluck('value', 'option_id')->all();
    }

    private function block(OptionKind $kind, string $label, int $order): RegistrationOption
    {
        return RegistrationOption::factory()->kind($kind)
            ->create(['event_id' => $this->event->id, 'label' => $label, 'sort_order' => $order]);
    }
}

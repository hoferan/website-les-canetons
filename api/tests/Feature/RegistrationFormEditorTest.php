<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Support\OptionKind;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * What the form editor (#319) needs from the options PUT: the form's own
 * settings saved with its blocks, under one tag.
 */
class RegistrationFormEditorTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->event = Event::factory()->takingRegistrations()->create([
            'registration_enabled' => false,
            'registration_asks_address' => true,
            'registration_asks_table' => true,
        ]);
        $this->organiser = Member::factory()->administrator()->create();
    }

    public function test_the_put_writes_the_form_settings_with_the_options(): void
    {
        $this->replace([['kind' => 'quantity', 'label' => 'Repas adulte']], $this->form([
            'registrationEnabled' => true,
            'registrationOpensAt' => null,
            'registrationClosesAt' => '2026-12-01T22:59:00Z',
            'registrationMaxGuests' => 8,
            'registrationAsksAddress' => false,
            'registrationAsksTable' => true,
        ]))->assertOk();

        $event = $this->event->fresh();
        $this->assertTrue($event->registration_enabled);
        $this->assertNull($event->registration_opens_at);
        $this->assertSame('2026-12-01T22:59:00+00:00', $event->registration_closes_at->utc()->toIso8601String());
        $this->assertSame(8, $event->registration_max_guests);
        $this->assertFalse($event->registration_asks_address);
        $this->assertTrue($event->registration_asks_table);
        $this->assertSame(1, $event->registrationOptions()->count());
    }

    public function test_a_put_without_form_leaves_the_settings_alone(): void
    {
        $closes = $this->event->registration_closes_at->toIso8601String();

        $this->replace([])->assertOk();

        $event = $this->event->fresh();
        $this->assertFalse($event->registration_enabled);
        $this->assertSame($closes, $event->registration_closes_at->toIso8601String());
        $this->assertTrue($event->registration_asks_address);
    }

    public function test_clearing_the_closing_date_ends_the_form(): void
    {
        $this->replace([], $this->form(['registrationClosesAt' => null]))->assertOk();

        $this->assertFalse($this->event->fresh()->takesRegistrations());
    }

    public function test_closing_must_follow_opening(): void
    {
        $this->replace([], $this->form([
            'registrationOpensAt' => '2026-12-05T10:00:00Z',
            'registrationClosesAt' => '2026-12-01T10:00:00Z',
        ]))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'form.registrationClosesAt');
    }

    public function test_the_people_cap_is_between_1_and_100(): void
    {
        foreach ([0, 101] as $cap) {
            $this->replace([], $this->form(['registrationMaxGuests' => $cap]))
                ->assertStatus(400)
                ->assertJsonPath('errors.0.field', 'form.registrationMaxGuests');
        }
    }

    public function test_a_form_with_a_setting_left_out_is_refused(): void
    {
        $form = $this->form();
        unset($form['registrationAsksTable']);

        $this->replace([], $form)
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'form.registrationAsksTable');
    }

    public function test_an_invalid_form_writes_no_option(): void
    {
        $this->replace(
            [['kind' => 'quantity', 'label' => 'Repas adulte']],
            $this->form(['registrationMaxGuests' => 0]),
        )->assertStatus(400);

        $this->assertSame(0, RegistrationOption::query()->count());
    }

    public function test_the_tag_moves_with_the_settings(): void
    {
        // Opened by the editor, then the form is opened from elsewhere: the
        // editor's save would otherwise close it again without seeing it.
        $stale = $this->ifMatch('event.options', $this->event);

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event', $this->event))
            ->patchJson("/api/v1/events/{$this->event->id}", ['registrationEnabled' => true])
            ->assertOk();

        $this->actingAsMember($this->organiser)
            ->withHeaders($stale)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", ['options' => []])
            ->assertStatus(412);
    }

    public function test_the_index_marks_answered_blocks_and_picked_answers(): void
    {
        $menu = RegistrationOption::factory()->create(['event_id' => $this->event->id, 'sort_order' => 0]);
        $size = RegistrationOption::factory()->create([
            'event_id' => $this->event->id,
            'kind' => OptionKind::Choice,
            'counts_guests' => false,
            'settings' => ['answers' => [['id' => 'a', 'label' => 'S'], ['id' => 'b', 'label' => 'M']]],
            'sort_order' => 1,
        ]);
        RegistrationOption::factory()->create([
            'event_id' => $this->event->id,
            'kind' => OptionKind::Text,
            'counts_guests' => false,
            'sort_order' => 2,
        ]);
        $this->answer($menu, 2);
        $this->answer($size, null, 'a');
        $this->answer($size, null, 'a');

        $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$this->event->id}/registration-options")
            ->assertOk()
            ->assertJsonPath('data.0.answered', true)
            ->assertJsonPath('data.0.pickedAnswerIds', [])
            ->assertJsonPath('data.1.answered', true)
            ->assertJsonPath('data.1.pickedAnswerIds', ['a'])
            ->assertJsonPath('data.2.answered', false)
            ->assertJsonPath('data.2.pickedAnswerIds', []);
    }

    public function test_the_put_answers_with_the_flags_too(): void
    {
        $menu = RegistrationOption::factory()->create(['event_id' => $this->event->id, 'label' => 'Repas adulte']);
        $this->answer($menu, 1);

        $this->replace([['id' => $menu->id, 'kind' => 'quantity', 'label' => 'Repas adulte']])
            ->assertOk()
            ->assertJsonPath('data.0.answered', true);
    }

    public function test_the_public_form_carries_no_flags(): void
    {
        $this->event->update(['registration_enabled' => true]);
        RegistrationOption::factory()->create(['event_id' => $this->event->id]);

        $option = $this->getJson("/api/v1/events/{$this->event->id}/registration")
            ->assertOk()
            ->json('options.0');

        $this->assertArrayNotHasKey('answered', $option);
        $this->assertArrayNotHasKey('pickedAnswerIds', $option);
    }

    public function test_a_booking_does_not_move_the_tag(): void
    {
        $menu = RegistrationOption::factory()->create(['event_id' => $this->event->id, 'label' => 'Repas adulte']);
        $before = $this->ifMatch('event.options', $this->event);

        $this->answer($menu, 1);

        $this->actingAsMember($this->organiser)
            ->withHeaders($before)
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", [
                'options' => [['id' => $menu->id, 'kind' => 'quantity', 'label' => 'Repas adulte']],
            ])
            ->assertOk();
    }

    private function answer(RegistrationOption $option, ?int $quantity, ?string $value = null): void
    {
        RegistrationChoice::create([
            'registration_id' => Registration::factory()->create(['event_id' => $option->event_id])->id,
            'option_id' => $option->id,
            'quantity' => $quantity,
            'value' => $value,
        ]);
    }

    /**
     * The six settings as the event holds them, with some replaced.
     *
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function form(array $overrides = []): array
    {
        return [
            'registrationEnabled' => false,
            'registrationOpensAt' => null,
            'registrationClosesAt' => $this->event->registration_closes_at->toIso8601String(),
            'registrationMaxGuests' => null,
            'registrationAsksAddress' => true,
            'registrationAsksTable' => true,
            ...$overrides,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $options
     * @param  array<string, mixed>|null  $form
     */
    private function replace(array $options, ?array $form = null): TestResponse
    {
        $body = ['options' => $options];
        if ($form !== null) {
            $body['form'] = $form;
        }

        return $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event.options', $this->event))
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", $body);
    }
}

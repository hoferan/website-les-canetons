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
 * An event's form as blocks the committee assembles (#114, ADR 0032).
 */
class RegistrationBlocksTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->event = Event::factory()->takingRegistrations()->create();
        $this->organiser = Member::factory()->administrator()->create();
    }

    public function test_each_kind_round_trips(): void
    {
        $this->replace([
            ['kind' => 'heading', 'label' => 'Repas'],
            ['kind' => 'quantity', 'label' => 'Menu viande', 'priceCents' => 4500, 'capacity' => 120, 'countsGuests' => true],
            ['kind' => 'yes_no', 'label' => 'Végétarien ?', 'required' => true],
            ['kind' => 'choice', 'label' => 'Taille', 'answers' => [['label' => 'S'], ['label' => 'M']]],
            ['kind' => 'text', 'label' => 'Allergies', 'description' => 'Laissez vide si aucune'],
            ['kind' => 'paragraph', 'label' => null, 'description' => "Paiement sur place.\nCash uniquement."],
        ])
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'heading')
            ->assertJsonPath('data.1.kind', 'quantity')
            ->assertJsonPath('data.1.countsGuests', true)
            ->assertJsonPath('data.1.capacity', 120)
            ->assertJsonPath('data.2.kind', 'yes_no')
            ->assertJsonPath('data.2.required', true)
            ->assertJsonPath('data.2.countsGuests', false)
            ->assertJsonPath('data.3.answers.0.label', 'S')
            ->assertJsonPath('data.3.answers.1.label', 'M')
            ->assertJsonPath('data.4.answers', [])
            ->assertJsonPath('data.5.label', null)
            ->assertJsonPath('data.5.description', "Paiement sur place.\nCash uniquement.");

        $this->assertSame(OptionKind::Paragraph, $this->event->registrationOptions()->get()[5]->kind);
    }

    public function test_an_entry_without_a_kind_is_a_menu(): void
    {
        // What every client sent before the kinds existed: a priced line that
        // counts people.
        $this->replace([['label' => 'Menu viande', 'priceCents' => 4500]])
            ->assertOk()
            ->assertJsonPath('data.0.kind', 'quantity')
            ->assertJsonPath('data.0.countsGuests', true);
    }

    public function test_price_and_capacity_are_refused_outside_quantity(): void
    {
        $this->replace([['kind' => 'text', 'label' => 'Allergies', 'priceCents' => 500]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.priceCents');

        $this->replace([['kind' => 'yes_no', 'label' => 'Végétarien ?', 'capacity' => 10]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.capacity');

        $this->replace([['kind' => 'text', 'label' => 'Allergies', 'countsGuests' => true]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.countsGuests');
    }

    public function test_a_choice_needs_two_answers(): void
    {
        $this->replace([['kind' => 'choice', 'label' => 'Taille', 'answers' => [['label' => 'S']]]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.answers')
            ->assertJsonPath('errors.0.reason', 'too_few_answers');
    }

    public function test_answers_are_refused_outside_a_choice(): void
    {
        $this->replace([['kind' => 'text', 'label' => 'Allergies', 'answers' => [['label' => 'S'], ['label' => 'M']]]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.answers');
    }

    public function test_a_heading_needs_a_label_and_a_paragraph_needs_a_body(): void
    {
        $this->replace([['kind' => 'heading', 'label' => null]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.label');

        $this->replace([['kind' => 'paragraph', 'label' => null, 'description' => null]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.description');
    }

    public function test_a_paragraph_takes_a_long_body(): void
    {
        $this->replace([['kind' => 'paragraph', 'description' => str_repeat('a', 1500)]])->assertOk();

        $this->replace([['kind' => 'paragraph', 'description' => str_repeat('a', 2001)]])
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'options.0.description');
    }

    public function test_new_answers_get_stable_keys(): void
    {
        $first = $this->replace([
            ['kind' => 'choice', 'label' => 'Taille', 'answers' => [['label' => 'S'], ['label' => 'M']]],
        ])->assertOk();

        $id = $first->json('data.0.id');
        $small = $first->json('data.0.answers.0.key');
        $this->assertMatchesRegularExpression('/^[a-z0-9]{8}$/', $small);

        $this->replace([
            ['id' => $id, 'kind' => 'choice', 'label' => 'Taille', 'answers' => [
                ['key' => $small, 'label' => 'Small'],
                ['key' => $first->json('data.0.answers.1.key'), 'label' => 'M'],
            ]],
        ])
            ->assertOk()
            ->assertJsonPath('data.0.answers.0.key', $small)
            ->assertJsonPath('data.0.answers.0.label', 'Small');
    }

    public function test_a_keyless_answer_adopts_the_key_of_the_same_label(): void
    {
        // A replayed first save sends no keys; matching by label keeps a
        // booking that picked "S" in between pointing at an answer that exists.
        $option = RegistrationOption::factory()->choiceOf(['S', 'M'])->create(['event_id' => $this->event->id]);

        $this->replace([
            ['id' => $option->id, 'kind' => 'choice', 'label' => 'Taille', 'answers' => [['label' => 'S'], ['label' => 'M']]],
        ])
            ->assertOk()
            ->assertJsonPath('data.0.answers.0.key', 's');
    }

    public function test_a_booked_block_cannot_change_kind(): void
    {
        $option = RegistrationOption::factory()->kind(OptionKind::Text)->create(['event_id' => $this->event->id, 'label' => 'Allergies']);
        $this->book($option, null, 'noix');

        $this->replace([['id' => $option->id, 'kind' => 'yes_no', 'label' => 'Allergies']])
            ->assertStatus(409)
            ->assertJsonPath('code', 'option_shape_locked');

        $this->assertSame(OptionKind::Text, $option->fresh()->kind);
    }

    public function test_a_booked_block_cannot_flip_counts_guests(): void
    {
        $option = RegistrationOption::factory()->create(['event_id' => $this->event->id]);
        $this->book($option, 2);

        $this->replace([['id' => $option->id, 'kind' => 'quantity', 'label' => 'Menu viande', 'countsGuests' => false]])
            ->assertStatus(409)
            ->assertJsonPath('code', 'option_shape_locked');

        $this->assertTrue($option->fresh()->counts_guests);
    }

    public function test_an_unbooked_block_can_change_kind(): void
    {
        $option = RegistrationOption::factory()->kind(OptionKind::Text)->create(['event_id' => $this->event->id, 'label' => 'Allergies']);

        $this->replace([['id' => $option->id, 'kind' => 'yes_no', 'label' => 'Allergies']])->assertOk();

        $this->assertSame(OptionKind::YesNo, $option->fresh()->kind);
    }

    public function test_a_picked_answer_cannot_be_removed(): void
    {
        $option = RegistrationOption::factory()->choiceOf(['S', 'M'])->create(['event_id' => $this->event->id]);
        $this->book($option, null, 's');

        $this->replace([
            ['id' => $option->id, 'kind' => 'choice', 'label' => 'Taille', 'answers' => [['key' => 'm', 'label' => 'M'], ['label' => 'L']]],
        ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'choice_answer_in_use');

        $this->assertSame('S', $option->fresh()->answers()[0]['label']);
    }

    public function test_an_unpicked_answer_can_be_removed(): void
    {
        $option = RegistrationOption::factory()->choiceOf(['S', 'M', 'L'])->create(['event_id' => $this->event->id]);
        $this->book($option, null, 's');

        $this->replace([
            ['id' => $option->id, 'kind' => 'choice', 'label' => 'Taille', 'answers' => [['key' => 's', 'label' => 'S'], ['key' => 'm', 'label' => 'M']]],
        ])->assertOk();

        $this->assertCount(2, $option->fresh()->answers());
    }

    public function test_a_replayed_first_save_with_unlabelled_blocks_converges(): void
    {
        $body = [
            ['kind' => 'paragraph', 'label' => null, 'description' => 'Paiement sur place.'],
            ['kind' => 'quantity', 'label' => 'Menu viande', 'priceCents' => 4500],
            ['kind' => 'paragraph', 'label' => null, 'description' => 'Merci !'],
        ];

        $this->replace($body)->assertOk();
        $this->book($this->event->registrationOptions()->where('label', 'Menu viande')->sole(), 2);

        $this->replace($body)->assertOk()->assertJsonCount(3, 'data');
        $this->assertSame(3, $this->event->registrationOptions()->count());
    }

    /** @param  list<array<string, mixed>>  $options */
    private function replace(array $options): TestResponse
    {
        return $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event.options', $this->event))
            ->putJson("/api/v1/events/{$this->event->id}/registration-options", ['options' => $options]);
    }

    private function book(RegistrationOption $option, ?int $quantity, ?string $value = null): void
    {
        $booking = Registration::factory()->create(['event_id' => $option->event_id]);

        RegistrationChoice::create([
            'registration_id' => $booking->id,
            'option_id' => $option->id,
            'quantity' => $quantity,
            'value' => $value,
        ]);
    }
}

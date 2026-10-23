<?php

namespace Database\Factories;

use App\Models\Event;
use App\Models\RegistrationOption;
use App\Support\OptionKind;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<RegistrationOption> */
class RegistrationOptionFactory extends Factory
{
    protected $model = RegistrationOption::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'event_id' => Event::factory()->takingRegistrations(),
            'kind' => OptionKind::Quantity,
            'label' => 'Menu viande',
            'description' => null,
            'counts_guests' => true,
            'price_cents' => 4500,
            'sort_order' => 0,
        ];
    }

    /** Another kind of block, with the quantity-only settings cleared. */
    public function kind(OptionKind $kind): static
    {
        return $this->state(fn (): array => $kind === OptionKind::Quantity
            ? ['kind' => $kind]
            : ['kind' => $kind, 'price_cents' => null, 'counts_guests' => false]);
    }

    /**
     * A single choice over these answers, identified by lower-case slugs of the
     * labels so a test can name the id it books.
     *
     * @param  list<string>  $labels
     */
    public function choiceOf(array $labels): static
    {
        return $this->kind(OptionKind::Choice)->state(fn (): array => [
            'label' => 'Taille de t-shirt',
            'settings' => ['answers' => array_map(
                fn (string $label): array => ['id' => strtolower($label), 'label' => $label],
                $labels,
            )],
        ]);
    }

    public function required(): static
    {
        return $this->state(fn (): array => ['required' => true]);
    }

    /** A quantity that is not people, such as bottles brought along. */
    public function uncounted(): static
    {
        return $this->state(fn (): array => [
            'label' => 'Bouteilles',
            'price_cents' => null,
            'counts_guests' => false,
        ]);
    }

    public function free(): static
    {
        return $this->state(fn (): array => ['price_cents' => null]);
    }

    public function labelled(string $label, ?int $priceCents = 4500): static
    {
        return $this->state(fn (): array => ['label' => $label, 'price_cents' => $priceCents]);
    }
}

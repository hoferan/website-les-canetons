<?php

namespace Database\Factories;

use App\Models\Event;
use App\Models\RegistrationOption;
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
            'label' => 'Menu viande',
            'description' => null,
            'price_cents' => 4500,
            'sort_order' => 0,
        ];
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

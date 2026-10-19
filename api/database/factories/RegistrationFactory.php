<?php

namespace Database\Factories;

use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Registration> */
class RegistrationFactory extends Factory
{
    protected $model = Registration::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'event_id' => Event::factory()->takingRegistrations(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => '079 322 12 57',
            'address' => null,
            'table_name' => null,
        ];
    }

    /**
     * Attaches a booked option after creation.
     *
     * A choice needs both parents to exist, so this cannot be a state. There
     * is no RegistrationChoiceFactory, since an orphan choice is something the
     * schema forbids.
     */
    public function withChoice(RegistrationOption $option, int $quantity = 1): static
    {
        return $this->afterCreating(function (Registration $registration) use ($option, $quantity): void {
            RegistrationChoice::create([
                'registration_id' => $registration->id,
                'option_id' => $option->id,
                'quantity' => $quantity,
            ]);
        });
    }
}

<?php

namespace Database\Factories;

use App\Models\ContactMessage;
use App\Models\Member;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<ContactMessage> */
class ContactMessageFactory extends Factory
{
    protected $model = ContactMessage::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'last_name' => $this->faker->lastName(),
            'first_name' => $this->faker->firstName(),
            'email' => $this->faker->safeEmail(),
            'subject' => $this->faker->sentence(4),
            'message' => $this->faker->paragraph(),
        ];
    }

    /** Already dealt with, by a named member. */
    public function handled(Member $by): static
    {
        return $this->state(fn () => [
            'handled_at' => now(),
            'handled_by_member_id' => $by->id,
        ]);
    }
}

<?php

namespace Database\Factories;

use App\Models\Event;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * A row on the planning.
 *
 * `starts_at` defaults to weeks in the future. Most event tests are about
 * upcoming events, and a default of now() would put every row on the
 * boundary the upcoming/past split turns on, making tests fail around
 * midnight. The wide margin keeps every row clearly on one side.
 *
 * `ends_at` defaults to two hours after `starts_at`, a rehearsal's length:
 * the column is NOT NULL and must make sense next to the start.
 *
 * @extends Factory<Event>
 */
class EventFactory extends Factory
{
    protected $model = Event::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $start = Carbon::now()->addWeeks(fake()->numberBetween(1, 12))
            ->setTime(fake()->numberBetween(8, 20), 0);

        return [
            'title' => fake()->randomElement(['Répétition', 'Concert', 'Sortie', 'Assemblée générale']),
            'starts_at' => $start,
            'ends_at' => $start->clone()->addHours(2),
            'location' => fake()->randomElement(['Werkhof', 'Salle paroissiale', 'Place Python', 'Halle des fêtes']),
            'attire' => null,
            'is_public' => false,
            'notes' => null,
            // Published by default, so a test builds an event the band can
            // see. A draft is the opt-in.
            'published_at' => Carbon::now(),
        ];
    }

    /** An event nobody but events.manage can see yet. */
    public function draft(): static
    {
        return $this->state(fn (): array => ['published_at' => null]);
    }

    /**
     * A row clearly in the past, for tests of the upcoming/past split. Weeks
     * back, for the same reason the default is weeks out.
     */
    public function past(): static
    {
        return $this->state(function (): array {
            $start = Carbon::now()->subWeeks(fake()->numberBetween(1, 12))
                ->setTime(fake()->numberBetween(8, 20), 0);

            return [
                'starts_at' => $start,
                'ends_at' => $start->clone()->addHours(2),
            ];
        });
    }

    /** An event the public agenda may show. */
    public function public(): static
    {
        return $this->state(fn (): array => ['is_public' => true]);
    }

    /**
     * An event whose registration form is open.
     *
     * Registration is enabled iff `registration_closes_at` is set (ADR 0020), so
     * the close date is the whole switch. `opens_at` stays null, meaning open
     * immediately, which is what a test that says nothing about dates wants.
     */
    public function takingRegistrations(?int $maxGuests = null): static
    {
        return $this->state(fn (): array => [
            'registration_closes_at' => Carbon::now()->addWeeks(2),
            'registration_max_guests' => $maxGuests,
        ]);
    }

    /** Enabled, but the form has not opened yet. */
    public function registrationNotYetOpen(): static
    {
        return $this->state(fn (): array => [
            'registration_opens_at' => Carbon::now()->addWeek(),
            'registration_closes_at' => Carbon::now()->addWeeks(3),
        ]);
    }

    /** Enabled, but the deadline has passed. */
    public function registrationClosed(): static
    {
        return $this->state(fn (): array => [
            'registration_opens_at' => Carbon::now()->subWeeks(3),
            'registration_closes_at' => Carbon::now()->subDay(),
        ]);
    }
}

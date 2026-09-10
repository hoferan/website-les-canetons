<?php

namespace Database\Factories;

use App\Models\Event;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Carbon;

/**
 * A row on the planning.
 *
 * `starts_at` DEFAULTS TO THE FUTURE, deliberately, and by more than a day.
 * Most tests in this plan — and all of R1c-2's — are about upcoming events,
 * and a default of now() (or "today") would put every factory-built row
 * exactly on the boundary the upcoming/past split turns on. That produces
 * tests that fail once a day, at midnight, for reasons nobody can reproduce:
 * a wide margin (weeks out) keeps every row unambiguously on one side.
 *
 * `ends_at` defaults two hours after `starts_at` — a rehearsal's actual
 * length — rather than to Faker noise, since `ends_at` is NOT NULL (C6) and
 * every row needs one that makes sense next to its start.
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
        ];
    }

    /**
     * A row unambiguously in the past, since Task 4 needs one to test the
     * upcoming/past split against. Weeks back, for the same reason the
     * default is weeks out: no ambiguity at the boundary.
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

    /** An event the public page (a later release) is allowed to show. */
    public function public(): static
    {
        return $this->state(fn (): array => ['is_public' => true]);
    }

    /**
     * An event whose registration form is OPEN.
     *
     * Registration is enabled iff `registration_closes_at` is set (D9), so
     * setting the close date is the whole switch. `opens_at` is left null,
     * which means open immediately — the common case, and the one a test
     * that says nothing about dates wants.
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

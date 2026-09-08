<?php

namespace Database\Factories;

use App\Models\Section;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * A register ("pupitre").
 *
 * The six real ones are reference data from 2026_09_07_000001 and are already
 * present in every test — read them with Section::where('name', …), or use
 * MemberFactory::inSection(). This factory is for a register that must NOT be
 * one of the six, such as MemberModelTest's check that deleting a register
 * leaves its members sectionless.
 *
 * @extends Factory<Section>
 */
class SectionFactory extends Factory
{
    protected $model = Section::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => 'Fixture '.fake()->unique()->numberBetween(1, 99999),
            'sort_order' => fake()->numberBetween(90, 99),
        ];
    }
}

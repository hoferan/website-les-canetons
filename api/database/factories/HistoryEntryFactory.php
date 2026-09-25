<?php

namespace Database\Factories;

use App\Models\HistoryEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<HistoryEntry> */
class HistoryEntryFactory extends Factory
{
    protected $model = HistoryEntry::class;

    public function definition(): array
    {
        return [
            'occurred_on' => '2010-01-01',
            'precision' => 'year',
            'title_fr' => 'Une année',
            'body_fr' => null,
            'title_de' => null,
            'body_de' => null,
            'important' => false,
            'icon' => null,
        ];
    }
}

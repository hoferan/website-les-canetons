<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The four tags the band's planning already sorts itself into (#107).
 *
 * A migration and not a seeder, because the shared host has no shell to run a
 * seeder with. Inserts only a label that is missing and never touches one
 * that exists, so a colour the committee changed survives a re-run.
 */
return new class extends Migration
{
    private const TAGS = [
        ['label_fr' => 'Répétition', 'label_de' => 'Probe', 'colour' => 'violet'],
        ['label_fr' => 'Concert', 'label_de' => 'Konzert', 'colour' => 'teal'],
        ['label_fr' => 'Sortie', 'label_de' => 'Auftritt', 'colour' => 'amber'],
        ['label_fr' => 'Carnaval', 'label_de' => 'Fasnacht', 'colour' => 'pink'],
    ];

    public function up(): void
    {
        $now = now();

        foreach (self::TAGS as $order => $tag) {
            if (DB::table('event_tags')->where('label_fr', $tag['label_fr'])->exists()) {
                continue;
            }

            DB::table('event_tags')->insert($tag + [
                'sort_order' => $order + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Nothing: by the time this could run, the rows are the committee's.
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Whether answering "Oui" to an event with this tag throws confetti (#108).
 *
 * A flag on the tag, because the tags are content the committee names and
 * nothing in a label says which ones are worth celebrating. Carnaval starts
 * with it, found by its seeded label. The flag is set only in the run that
 * adds the column, so a committee that turned it off never sees it come back.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('event_tags', 'celebrate')) {
            return;
        }

        Schema::table('event_tags', function (Blueprint $table) {
            $table->boolean('celebrate')->default(false)->after('colour');
        });

        DB::table('event_tags')->where('label_fr', 'Carnaval')->update(['celebrate' => true]);
    }

    public function down(): void
    {
        Schema::dropColumns('event_tags', ['celebrate']);
    }
};

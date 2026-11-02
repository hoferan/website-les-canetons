<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The texts of the public pages that the band has changed (#106): one row per
 * catalogue key, with the French and the German wording.
 *
 * The key is the path of the text in the SPA's catalogue, such as
 * `join.facts.schedule.time`. The catalogue keeps the default, so a key with
 * no row shows the wording the code ships with, and the server never needs to
 * know which keys exist. Same reasoning as photo_slots: a new editable text is
 * a component on a page and nothing here.
 *
 * A row is made by the first write and deleted when both languages are
 * cleared, so "back to the original" leaves nothing behind.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('text_overrides')) {
            Schema::create('text_overrides', function (Blueprint $table) {
                $table->string('key', 128)->primary();
                $table->text('fr')->nullable();
                $table->text('de')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('text_overrides');
    }
};

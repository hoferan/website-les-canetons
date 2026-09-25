<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The band's history, one dated entry per row (#104).
 *
 * Four optional text columns, two per language. The rule that at least one is
 * filled lives in the controller, where it can answer with its own code; the
 * database only ever sees rows that passed it.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, like every migration here: RunPendingMigrations
        // re-checks for pending work on every request.
        if (Schema::hasTable('history_entries')) {
            return;
        }

        Schema::create('history_entries', function (Blueprint $table) {
            $table->id();
            $table->date('occurred_on');
            $table->string('precision', 8);
            $table->string('title_fr', 120)->nullable();
            $table->text('body_fr')->nullable();
            $table->string('title_de', 120)->nullable();
            $table->text('body_de')->nullable();
            $table->boolean('important')->default(false);
            $table->string('icon', 32)->nullable();
            $table->timestamps();

            // The only order the list is ever read in.
            $table->index('occurred_on');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('history_entries');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Event tags and the pivot that puts them on events (#107).
 *
 * Both foreign keys cascade. Deleting a tag takes it off its events, and the
 * tag editor says how many before it asks; deleting an event takes its tags
 * off with it and leaves the tags alone.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('event_tags')) {
            Schema::create('event_tags', function (Blueprint $table) {
                $table->id();
                // Unique under MariaDB's case-insensitive collation, so
                // "concert" collides with "Concert" here as it does in the
                // request's validation.
                $table->string('label_fr', 40)->unique();
                $table->string('label_de', 40)->nullable();
                $table->string('colour', 16);
                $table->unsignedInteger('sort_order');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('event_event_tag')) {
            Schema::create('event_event_tag', function (Blueprint $table) {
                $table->foreignId('event_id')->constrained()->cascadeOnDelete();
                $table->foreignId('event_tag_id')->constrained()->cascadeOnDelete();
                $table->primary(['event_id', 'event_tag_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('event_event_tag');
        Schema::dropIfExists('event_tags');
    }
};

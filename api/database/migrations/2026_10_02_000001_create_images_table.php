<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The image library (#105): one row per photo, and its JPEG bytes in up to
 * three sizes (ADR 0028).
 *
 * `images` describes the photo. `name` is the committee's label for it, shown
 * in the library and the picker and never on a public page, one name and not
 * one per language. `sha256`, `width` and `height` are those of its
 * largest size, and `bytes` is the total of all its sizes, which is what the
 * library's byte cap counts. Where a photo is shown, and what it says to a
 * screen reader there, belong to the placement (an `image_id` column on the
 * thing that shows it), because one photo can sit in several places.
 *
 * `sha256` is unique so a re-upload of the same photo finds its row instead of
 * adding a second copy against the library's cap.
 *
 * `image_files` holds the bytes, one row per size, keyed by the photo and the
 * size's width. Its own `sha256` is the digest of that size's bytes and the
 * name the file route serves it under, so a URL names exactly the bytes it
 * answers. Indexed, not unique: two rows holding the same bytes serve the
 * same answer, so either will do. Deleting a photo deletes its sizes with it. `data` is a
 * MEDIUMBLOB, up to 16 MB: Laravel's binary() makes a BLOB on MySQL, which
 * stops at 64 KB and would cut every photo short.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Idempotent, like every migration here: RunPendingMigrations
        // re-checks for pending work on every request.
        if (! Schema::hasTable('images')) {
            Schema::create('images', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->char('sha256', 64)->unique();
                $table->unsignedInteger('width');
                $table->unsignedInteger('height');
                $table->unsignedInteger('bytes');
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('image_files')) {
            Schema::create('image_files', function (Blueprint $table) {
                $table->foreignId('image_id')->constrained('images')->cascadeOnDelete();
                $table->unsignedInteger('width');
                $table->unsignedInteger('height');
                $table->unsignedInteger('bytes');
                $table->char('sha256', 64)->index();
                $table->primary(['image_id', 'width']);
            });
        }

        // The schema builder has no MEDIUMBLOB, so the column is added by hand.
        if (! Schema::hasColumn('image_files', 'data')) {
            DB::statement('ALTER TABLE image_files ADD COLUMN data MEDIUMBLOB NOT NULL');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('image_files');
        Schema::dropIfExists('images');
    }
};

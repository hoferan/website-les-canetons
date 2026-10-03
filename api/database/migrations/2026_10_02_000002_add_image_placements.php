<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where a library image can be placed (#105): a register, a history entry, and
 * the two single photos of the band page.
 *
 * EVERY FOREIGN KEY IS RESTRICT. Deleting an image that something still shows
 * would leave a hole in a public page, so the database refuses it and the
 * controller turns that refusal into a readable one.
 *
 * No placement carries alt text. The page describes each photo by what it
 * illustrates: the register's name, the band's, or the history entry's title.
 *
 * `site_photos` is a keyed row per slot rather than a column on some settings
 * table, because no such table exists and two slots do not justify one. Both
 * rows are inserted here and never created at runtime, so a slot name that is
 * not one of them cannot reach the table.
 *
 * ONE GUARD PER STATEMENT. MariaDB commits every DDL statement on its own, and
 * this runs on the first request after a deploy, where a worker can be killed
 * part way through. A column added without its constraint must not make the
 * re-run skip the constraint, so the column and the key are each checked on
 * their own.
 */
return new class extends Migration
{
    private const SLOTS = ['band', 'concert'];

    public function up(): void
    {
        $this->addImageReference('sections');
        $this->addImageReference('history_entries');

        if (! Schema::hasTable('site_photos')) {
            Schema::create('site_photos', function (Blueprint $table) {
                $table->string('slot', 16)->primary();
                $table->timestamps();
            });
        }
        $this->addImageReference('site_photos');

        // insertOrIgnore against the primary key: a re-run, or a slot somebody
        // already filled, is left exactly as it is.
        $now = now();

        foreach (self::SLOTS as $slot) {
            DB::table('site_photos')->insertOrIgnore([
                'slot' => $slot,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('site_photos');

        foreach (['history_entries', 'sections'] as $table) {
            if (! Schema::hasColumn($table, 'image_id')) {
                continue;
            }

            // The key before the column: MariaDB will not drop a column an
            // index still names.
            if ($this->hasImageForeignKey($table)) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropForeign(['image_id']);
                });
            }

            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->dropColumn('image_id');
            });
        }
    }

    /** A nullable `image_id` and its RESTRICT key on the table, each added only when missing. */
    private function addImageReference(string $table): void
    {
        if (! Schema::hasColumn($table, 'image_id')) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->unsignedBigInteger('image_id')->nullable();
            });
        }

        if (! $this->hasImageForeignKey($table)) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->foreign('image_id')->references('id')->on('images')->restrictOnDelete();
            });
        }
    }

    private function hasImageForeignKey(string $table): bool
    {
        foreach (Schema::getForeignKeys($table) as $key) {
            if ($key['columns'] === ['image_id']) {
                return true;
            }
        }

        return false;
    }
};

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
 * Only a history entry carries alt text, in both languages, because its photo
 * illustrates a story the committee wrote and only they can describe it. The
 * page slots carry none: the register's name, or the band's, describes them
 * well enough, and nobody would keep sixteen more fields up to date.
 *
 * `site_photos` is a keyed row per slot rather than a column on some settings
 * table, because no such table exists and two slots do not justify one. Both
 * rows are inserted here and never created at runtime, so a slot name that is
 * not one of them cannot reach the table.
 */
return new class extends Migration
{
    private const SLOTS = ['band', 'concert'];

    public function up(): void
    {
        if (! Schema::hasColumn('sections', 'image_id')) {
            Schema::table('sections', function (Blueprint $table) {
                $table->foreignId('image_id')->nullable()->constrained('images')->restrictOnDelete();
            });
        }

        if (! Schema::hasColumn('history_entries', 'image_id')) {
            Schema::table('history_entries', function (Blueprint $table) {
                $table->foreignId('image_id')->nullable()->constrained('images')->restrictOnDelete();
                $table->string('image_alt_fr', 250)->nullable();
                $table->string('image_alt_de', 250)->nullable();
            });
        }

        if (! Schema::hasTable('site_photos')) {
            Schema::create('site_photos', function (Blueprint $table) {
                $table->string('slot', 16)->primary();
                $table->foreignId('image_id')->nullable()->constrained('images')->restrictOnDelete();
                $table->timestamps();
            });
        }

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

        foreach (['history_entries' => ['image_alt_de', 'image_alt_fr'], 'sections' => []] as $table => $alts) {
            if (! Schema::hasColumn($table, 'image_id')) {
                continue;
            }

            Schema::table($table, function (Blueprint $blueprint) use ($alts) {
                // The constraint before the column: MariaDB will not drop a
                // column an index still names.
                $blueprint->dropForeign(['image_id']);
                $blueprint->dropColumn(['image_id', ...$alts]);
            });
        }
    }
};

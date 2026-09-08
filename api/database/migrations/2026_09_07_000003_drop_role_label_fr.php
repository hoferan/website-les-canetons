<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Removes the French display name from `roles`.
 *
 * WHY. The API is English without exception; the one thing that is not
 * translated is text a user typed. A seeded role's name is neither — a
 * developer chose "Team Direction" in a migration, which makes it system text,
 * and system text must be translatable by a fixed identifier. `roles.key`
 * already IS that identifier, so the display name belongs in
 * web/src/i18n/fr.ts keyed by it, and a column named after a language does not
 * belong in the schema at all.
 *
 * Contrast `sections.name`, which holds "Batteurs" and is right to: that is
 * also seeded system text today, but the register list is the band's own
 * vocabulary rather than a UI label, and it is displayed verbatim rather than
 * translated. The distinction that matters is not French-vs-English, it is
 * whether a translation layer needs a key to look up.
 *
 * NOT REPLACED BY `label`. When roles become editable (deferred by decision
 * B3), a committee-typed name IS user input and will need a nullable column,
 * with the UI falling back to the key's translation for rows nobody has
 * touched. Adding that column now would ship a branch no screen exercises.
 *
 * Idempotent, like every migration here: the same file runs against dev, TEST,
 * QA and PROD, and RunPendingMigrations re-checks on every request.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('roles', 'label_fr')) {
            Schema::table('roles', function (Blueprint $table): void {
                $table->dropColumn('label_fr');
            });
        }
    }

    /**
     * Restores the column so a rollback lands on a schema the earlier
     * migrations describe. The values are gone; nothing reads them any more.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('roles', 'label_fr')) {
            Schema::table('roles', function (Blueprint $table): void {
                $table->string('label_fr')->default('');
            });
        }
    }
};

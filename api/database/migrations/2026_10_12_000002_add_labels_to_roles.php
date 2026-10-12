<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A French and a German name for each role, typed in the role editor (#194).
 *
 * WHAT 2026_09_07_000003 SAID WOULD COME. It dropped the seeded `label_fr`,
 * because a name a developer chose is system text and belongs in the
 * catalogue under the role's key. A name the committee types is content, and
 * ADR 0026 stores content in both languages. So both columns are nullable and
 * the seeded roles get neither: the SPA shows a typed name where there is one
 * and the catalogue's translation of the key otherwise, so no French or German
 * is written into a migration.
 *
 * One small ALTER on a table of a handful of rows, guarded so a re-run does
 * nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('roles', 'label_fr')) {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->string('label_fr', 80)->nullable()->after('key');
            $table->string('label_de', 80)->nullable()->after('label_fr');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('roles', 'label_fr')) {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn(['label_fr', 'label_de']);
        });
    }
};

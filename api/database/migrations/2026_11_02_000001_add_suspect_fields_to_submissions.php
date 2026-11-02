<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which fields of a public booking or contact message looked like spam when
 * it arrived (#332, ADR 0037).
 *
 * A JSON list of field names, null when nothing did. Every existing row is
 * null, so nothing is backfilled, and the code before this deploy ignores the
 * column.
 *
 * SAFE TO RE-RUN. Each column is added only when missing.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['registrations' => 'table_name', 'contact_messages' => 'message'] as $table => $after) {
            if (! Schema::hasColumn($table, 'suspect_fields')) {
                Schema::table($table, function (Blueprint $blueprint) use ($after) {
                    $blueprint->json('suspect_fields')->nullable()->after($after);
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['registrations', 'contact_messages'] as $table) {
            if (Schema::hasColumn($table, 'suspect_fields')) {
                Schema::table($table, function (Blueprint $blueprint) {
                    $blueprint->dropColumn('suspect_fields');
                });
            }
        }
    }
};

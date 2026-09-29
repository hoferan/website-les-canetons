<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks the baseline role, so nothing has to recognise it by its key.
 *
 * ROLE KEYS ARE IDENTITY, NEVER LOGIC (ADR 0014). The baseline role is the one
 * every member holds and whose grants and existence are fixed; the lockout
 * guard that enforces that reads this flag instead of comparing `member`.
 *
 * One small ALTER on a table of a handful of rows, guarded so a re-run does
 * nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('roles', 'is_baseline')) {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->boolean('is_baseline')->default(false)->after('key');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('roles', 'is_baseline')) {
            return;
        }

        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('is_baseline');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The old schema created `instruments` with neither timestamp; the
        // original adopt-migration only added `updated_at`, leaving already-
        // migrated shared DBs without `created_at`. Repair that here.
        if (Schema::hasTable('instruments') && !Schema::hasColumn('instruments', 'created_at')) {
            Schema::table('instruments', function (Blueprint $table) {
                $table->timestamp('created_at')->useCurrent();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('instruments', 'created_at')) {
            Schema::table('instruments', function (Blueprint $table) {
                $table->dropColumn('created_at');
            });
        }
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('used_challenges')) {
            // Fresh creation (e.g. a wiped TEST database): create it directly
            // in the corrected shape — id as the real primary key, signature
            // as a unique-indexed column instead of the primary key.
            Schema::create('used_challenges', function (Blueprint $table) {
                $table->id();
                $table->char('signature', 64)->unique();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
                $table->index('created_at', 'idx_used_challenges_created');
            });
            return;
        }

        // Table already exists in the OLD shape (created by the old app):
        // signature CHAR(64) is the primary key, no id column at all. Convert
        // it to the corrected shape without losing existing rows.
        if (!Schema::hasColumn('used_challenges', 'id')) {
            // MariaDB requires the new AUTO_INCREMENT column to be part of a
            // key at the moment it's added, so add it with its own unique
            // key first, then swap the primary key, in explicit statements
            // (Laravel's Schema Builder has no single portable helper for
            // "replace the primary key" on an already-populated table).
            DB::statement('ALTER TABLE used_challenges DROP PRIMARY KEY');
            DB::statement('ALTER TABLE used_challenges ADD COLUMN id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY FIRST');
            DB::statement('ALTER TABLE used_challenges ADD UNIQUE KEY used_challenges_signature_unique (signature)');
        }

        if (!Schema::hasColumn('used_challenges', 'updated_at')) {
            Schema::table('used_challenges', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('used_challenges');
    }
};

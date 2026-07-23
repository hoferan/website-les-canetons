<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('responses')) {
            Schema::create('responses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
                $table->enum('answer', ['participate', 'notparticipate']);
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
                $table->unique(['user_id', 'event_id'], 'uq_response');
            });
            return;
        }

        // Table already exists (old app / 01-schema.sql) — adopt it: add the
        // one column it's missing, leave everything else untouched.
        if (!Schema::hasColumn('responses', 'updated_at')) {
            Schema::table('responses', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('responses');
    }
};

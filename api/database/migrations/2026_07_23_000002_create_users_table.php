<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Intentional deviation from Laravel's default users table: no email /
        // name columns. Members are children (~6-16) in the Guggenmusik who
        // often have no email, so accounts are identified by username only and
        // passwords are admin-managed (stored hashed). See app/Models/User.php
        // for the full rationale.
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('username')->unique();
                $table->string('password');
                $table->enum('role', ['user', 'moderator', 'admin'])->default('user');
                $table->foreignId('instrument_id')->nullable()->constrained('instruments')->nullOnDelete();
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
            });
            return;
        }

        // Table already exists (created by the old app) — adopt it: add the
        // one column it's missing, leave everything else (including existing
        // rows and the instrument_id foreign key) untouched.
        if (!Schema::hasColumn('users', 'updated_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};

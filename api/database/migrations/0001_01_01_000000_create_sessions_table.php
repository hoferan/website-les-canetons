<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// This project is API-only with SESSION_DRIVER=database (Sanctum SPA cookie
// auth). Laravel's default scaffold bundled `users` and
// `password_reset_tokens` into this file too — both are removed here: the
// real `users` table is owned by 2026_07_23_000002_create_users_table.php
// (with this project's own username/role/instrument_id schema), and there is
// no password-reset flow. Only the framework-owned `sessions` table remains.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sessions')) {
            return;
        }

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
    }
};

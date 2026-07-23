<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('events')) {
            Schema::create('events', function (Blueprint $table) {
                $table->id();
                $table->date('date');
                $table->string('title');
                $table->time('start_time');
                $table->time('end_time');
                $table->string('location');
                $table->string('attire')->nullable();
                $table->boolean('weekend')->default(false);
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
            });
            return;
        }

        // Table already exists (old app / 01-schema.sql) — adopt it: add the
        // one column it's missing, leave everything else untouched.
        if (!Schema::hasColumn('events', 'updated_at')) {
            Schema::table('events', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};

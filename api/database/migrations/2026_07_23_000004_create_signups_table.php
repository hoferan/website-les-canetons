<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('signups')) {
            Schema::create('signups', function (Blueprint $table) {
                $table->id();
                $table->string('occasion', 64);
                $table->string('first_name');
                $table->string('last_name');
                $table->string('address');
                $table->string('phone', 64);
                $table->string('email');
                $table->string('table_name');
                $table->text('menus');
                $table->timestamp('created_at')->useCurrent();
                $table->timestamp('updated_at')->nullable();
                $table->index('occasion', 'idx_signups_occasion');
                $table->index(['occasion', 'table_name'], 'idx_signups_table');
            });
            return;
        }

        if (!Schema::hasColumn('signups', 'updated_at')) {
            Schema::table('signups', function (Blueprint $table) {
                $table->timestamp('updated_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('signups');
    }
};

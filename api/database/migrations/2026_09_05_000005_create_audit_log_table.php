<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Privileged mutations only — never ordinary activity, and never attendance.
 *
 * This does not contradict the rebuild's "history is not relevant" decision:
 * that concerns attendance answers, which are dead data once an event has
 * happened. This is a security control, and it is what makes "why does this
 * person have access?" answerable at all.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_log', function (Blueprint $table) {
            $table->id();

            // nullOnDelete, not cascade: an entry recording what someone did
            // must survive that someone leaving the band. Losing the actor's
            // identity is acceptable; losing the record is not.
            $table->foreignId('actor_member_id')->nullable()
                ->constrained('members')->nullOnDelete();

            $table->string('action', 64);
            $table->string('target_type', 32);

            // Plain integer with no foreign key: the target is usually
            // hard-deleted moments later, and a constraint would either block
            // that or erase the entry.
            $table->unsignedBigInteger('target_id')->nullable();

            // Who or what the target WAS, captured at write time. Without this
            // the log says "member 47 was deleted" and nobody can tell who 47
            // was.
            $table->string('target_label');

            $table->timestamp('created_at')->useCurrent();
            $table->index(['target_type', 'target_id']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_log');
    }
};

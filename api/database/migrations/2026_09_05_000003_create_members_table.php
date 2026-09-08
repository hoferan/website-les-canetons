<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The single roster. Replaces `users`.
 *
 * A ROW IS A PERSON THE BAND TRACKS FOR EVENTS, AND EVERY ONE OF THEM HAS AN
 * ACCOUNT. This file originally made `username` and `password` nullable so that
 * an instructor on the public page, or a young member whose parent answers,
 * needed no login. That conflated two populations and produced a lockout: a
 * holder of members.manage who could not log in still counted as an
 * administrator. 2026_09_08_000001 made both columns NOT NULL — a young
 * member's parent uses their login on their behalf, and people the band merely
 * DISPLAYS are content rather than rows here. Read that migration before
 * relaxing anything below.
 *
 * There is deliberately no email column: members are children (~6-16) who often
 * have no address of their own, and passwords are admin-issued. There is also
 * no `active` flag — existence IS the state (design D3), so leaving the band is
 * a delete, and the foreign keys cascade.
 *
 * `role` is absent on purpose. Authorization comes from roles/permissions
 * (Task 3); nothing here grants anything.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('members', function (Blueprint $table) {
            $table->id();
            $table->string('first_name');
            $table->string('last_name');

            // The register this person plays in. Its presence is also what makes
            // them answerable for events — an instructor with no register is not
            // in the attendance list, so no spurious "sans réponse" is counted.
            $table->foreignId('section_id')->nullable()
                ->constrained('sections')->nullOnDelete();

            $table->string('username')->nullable()->unique();
            $table->string('password')->nullable();
            $table->boolean('must_change_password')->default(false);
            $table->timestamp('last_login_at')->nullable();

            $table->string('committee_title')->nullable();
            $table->foreignId('instructor_of_section_id')->nullable()
                ->constrained('sections')->nullOnDelete();

            // Consent, per person, to appear on the public roster. Defaults to
            // false: these are minors, so publication is opt-in.
            $table->boolean('public_visible')->default(false);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('members');
    }
};

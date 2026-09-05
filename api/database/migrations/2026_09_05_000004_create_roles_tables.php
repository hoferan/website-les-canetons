<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Roles are DATA; permissions are CODE (see App\Support\Permission).
 *
 * There are deliberately no per-member permission grants. Direct grants are
 * what rots an RBAC system — "why does she have this?" stops being answerable.
 * Permissions arrive only through roles, so the answer is always "because she
 * is in that role".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->id();
            // The stable identifier used in seeds and tests.
            $table->string('key')->unique();
            // The French label shown in the admin UI. The only French in the
            // database, and it is display copy, never an identifier.
            $table->string('label_fr');
            $table->timestamps();
        });

        Schema::create('role_permissions', function (Blueprint $table) {
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            // A Permission enum VALUE. Stored as a string, not an enum column:
            // adding a permission must be a code change plus a data row, never
            // an ALTER TABLE on a live shared host.
            $table->string('permission', 64);
            $table->primary(['role_id', 'permission']);
        });

        Schema::create('member_roles', function (Blueprint $table) {
            $table->foreignId('member_id')->constrained('members')->cascadeOnDelete();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->primary(['member_id', 'role_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_roles');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('roles');
    }
};

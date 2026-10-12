<?php

use App\Support\PhoneNumber;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Each booking's telephone number in E.164, beside the number as typed (#129).
 *
 * `phone` is not touched: it stays the committee's only copy of what the
 * guest wrote. The new column is filled for every existing booking, and
 * App\Models\Registration fills it on every write from now on. A number that
 * cannot be read safely stays null; see App\Support\PhoneNumber.
 *
 * SAFE TO RE-RUN. The column is added only when missing, and the backfill
 * only fills rows that are still null, through the query builder so no model
 * event runs. A booking table holds a few hundred rows, so it is one pass.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('registrations', 'phone_e164')) {
            Schema::table('registrations', function (Blueprint $table) {
                // E.164 is at most fifteen digits after the `+`.
                $table->string('phone_e164', 16)->nullable()->after('phone');
            });
        }

        DB::table('registrations')->whereNull('phone_e164')->orderBy('id')
            ->each(function (object $row): void {
                $e164 = PhoneNumber::e164((string) $row->phone);

                if ($e164 !== null) {
                    DB::table('registrations')->where('id', $row->id)->update(['phone_e164' => $e164]);
                }
            });
    }

    public function down(): void
    {
        if (Schema::hasColumn('registrations', 'phone_e164')) {
            Schema::table('registrations', function (Blueprint $table) {
                $table->dropColumn('phone_e164');
            });
        }
    }
};

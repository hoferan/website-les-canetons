<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The committee's seats become reference data, and `members.committee_title`
 * goes away.
 *
 * WHAT WAS WRONG WITH THE TYPED NAME. It was three problems wearing one coat:
 * a typo in it was published on a page the band hands out; nothing beside it
 * ranked the seats, so /committee could only sort alphabetically and put the
 * caissière above the présidente; and a name somebody typed is content, which
 * no translation layer can reach — German is plausible in bilingual Fribourg
 * and a typed name would never be reachable by it. A table with `sort_order`
 * answers all three, and puts seats on the same rung of the editability ladder
 * as the registers (ADR 0014): the database today, the deferred editor
 * later.
 *
 * SHAPED EXACTLY LIKE `sections`, deliberately — id, unique name, sort_order,
 * timestamps. Two reference tables that differ for no reason are two things to
 * learn, and the roster form now renders both through the same select.
 *
 * A MIGRATION RATHER THAN A SEEDER, for the reason 2026_09_07_000001 gives at
 * length: the shared host has no shell, so the migration path is the only
 * mechanism that reaches a deployed database.
 *
 * IDEMPOTENT AND NON-DESTRUCTIVE. RunPendingMigrations re-checks for pending
 * work on every request and the same file runs against TEST, QA and PROD, so
 * every step below is guarded and every seat that exists is left alone.
 */
return new class extends Migration
{
    /**
     * The eight seats the band actually had, recovered verbatim from the
     * pre-rebuild /comite-team-direction page, IN RANK ORDER — which is the
     * whole reason this table exists.
     *
     * The spellings are gendered because the band's were. Whether they should
     * read "Président·e" is a content question, and the answer to it is now a
     * row somebody edits rather than a deploy somebody asks for.
     */
    private const SEATS = [
        'Présidente',
        'Vice-présidente - secrétaire',
        'Responsable prestations',
        'Responsable caisse',
        'Responsable intendance',
        'Responsable costumes',
        'Responsable Team Direction',
        'Membre',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('committee_functions')) {
            Schema::create('committee_functions', function (Blueprint $table) {
                $table->id();
                $table->string('name')->unique();
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();
            });

            $this->seatTheEight();
        }

        if (! Schema::hasColumn('members', 'committee_function_id')) {
            Schema::table('members', function (Blueprint $table) {
                // nullOnDelete, like section_id: deleting a seat must empty the
                // chairs, never delete the people sitting in them.
                $table->foreignId('committee_function_id')->nullable()->after('section_id')
                    ->constrained('committee_functions')->nullOnDelete();
            });
        }

        if (Schema::hasColumn('members', 'committee_title')) {
            $this->carryOverTypedSeats();

            Schema::table('members', function (Blueprint $table) {
                $table->dropColumn('committee_title');
            });
        }
    }

    /**
     * The bootstrap set, written ONLY on the run that creates the table.
     *
     * NOT `insertOrIgnore` ON EVERY RUN, which is what 2026_09_07_000001 does
     * for the registers — and measured 2026-09-14, that does resurrect a
     * renamed row: the rename empties the unique index of the old name, so the
     * next run inserts it again and the committee has two rows where they meant
     * one. Its comment claims otherwise. Seeding once, at creation, cannot do
     * that, and it also honours a seat the committee DELETED because they never
     * fill it.
     */
    private function seatTheEight(): void
    {
        $now = now();

        foreach (self::SEATS as $index => $name) {
            DB::table('committee_functions')->insert([
                'name' => $name,
                'sort_order' => $index + 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    /**
     * Move what the committee typed onto the reference row that means it.
     *
     * A SEAT NOBODY PREDICTED GETS A ROW OF ITS OWN, appended after the eight.
     * The alternative — dropping the column and keeping only what matched — is
     * a /committee page that comes back one card shorter after a deploy, with
     * nothing saying which card. The eight are what the band had, not a closed
     * set.
     *
     * A BLANK RESOLVES TO NO SEAT. The old roster form wrote '' rather than
     * null when somebody cleared the field, and CommitteeController trimmed it
     * away on every read. That filter is deleted with this change, so the blank
     * has to be resolved here or it becomes a reference row named ''.
     */
    private function carryOverTypedSeats(): void
    {
        $typed = DB::table('members')->whereNotNull('committee_title')->distinct()->pluck('committee_title');

        foreach ($typed as $title) {
            $name = trim((string) $title);

            if ($name === '') {
                continue;
            }

            $seatId = DB::table('committee_functions')->where('name', $name)->value('id')
                ?? DB::table('committee_functions')->insertGetId([
                    'name' => $name,
                    'sort_order' => (int) DB::table('committee_functions')->max('sort_order') + 1,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

            DB::table('members')->where('committee_title', $title)
                ->update(['committee_function_id' => $seatId]);
        }
    }

    /**
     * Puts the typed column back and refills it from the reference rows, so a
     * rollback loses the ranking rather than the committee.
     */
    public function down(): void
    {
        if (! Schema::hasColumn('members', 'committee_title')) {
            Schema::table('members', function (Blueprint $table) {
                $table->string('committee_title')->nullable()->after('section_id');
            });
        }

        if (Schema::hasColumn('members', 'committee_function_id')) {
            DB::table('members')
                ->join('committee_functions', 'committee_functions.id', '=', 'members.committee_function_id')
                ->update(['members.committee_title' => DB::raw('committee_functions.name')]);

            Schema::table('members', function (Blueprint $table) {
                // The constraint before the column: MariaDB will not drop a
                // column an index still names.
                $table->dropForeign(['committee_function_id']);
                $table->dropColumn('committee_function_id');
            });
        }

        Schema::dropIfExists('committee_functions');
    }
};

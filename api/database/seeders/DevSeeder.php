<?php

namespace Database\Seeders;

use App\Models\CommitteeFunction;
use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Database\Seeder;

/**
 * Local development and test data. Synthetic only: never a real member's name
 * and never a real password.
 *
 * Personas, by the roles they hold (every one also holds the baseline `member`
 * role, and every one with a register also holds `musician`):
 *
 * - demo.direction: `direction`. Organises, does not play (no register).
 * - demo.player: `musician`. Plays, organises nothing.
 * - demo.both: `musician` and `direction`. Plays and organises.
 * - demo.committee: `musician` and `committee`. Plays, and sees the guest list.
 * - demo.young: `musician`. Plays; a parent uses the login.
 *
 * Idempotent, because the dev container runs migrations (and may run this) on
 * every start.
 */
class DevSeeder extends Seeder
{
    public function run(): void
    {
        // Nothing may ever create demo.* accounts with a known password on a
        // real server. The build artifact leaves database/seeders/ out
        // (tools/artifact-excludes.mjs) and nothing on a server runs db:seed;
        // this guard holds if either of those changes.
        if (app()->isProduction()) {
            return;
        }

        // The registers are reference data from migration 2026_09_07_000001.
        // Using the real ones makes the dev stack render the same register
        // list as a server, so a local screenshot is representative.
        $sections = Section::orderBy('sort_order')->get()->keyBy('name');

        // The roles come from the migration too. firstOrCreate here would
        // create a second role with the same key, and syncPermissions would
        // undo a developer's hand-edits, which DevSeederTest pins.
        $direction = Role::where('key', 'direction')->sole();
        $committee = Role::where('key', 'committee')->sole();

        // Organises, does not play: no register, so never in an attendance list.
        $this->member('demo.direction', 'Dominique', 'Direction', null)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // Plays, organises nothing.
        $this->member('demo.player', 'Perrine', 'Player', $sections['Cloches']->id);

        // Plays and organises: an either/or role model breaks on this member.
        //
        // Also the one instructor, so the public band page's instructor branch
        // renders in development. `instructor_of_section_id` is a different
        // column from `section_id`, so Bastien is listed as a player under the
        // trumpets and as an instructor under the drums.
        $this->member('demo.both', 'Bastien', 'Both', $sections['Trompettes']->id, [
            'instructor_of_section_id' => $sections['Batteurs']->id,
        ])->roles()->syncWithoutDetaching([$direction->id]);

        // Holds the committee role and plays: the guest list is the only
        // thing they can see, and they are still in the attendance list.
        //
        // The seat, not the role, puts them on the public committee page. The
        // `committee` role is authorisation; 'Responsable intendance' is a row
        // in committee_functions that the site shows verbatim as a caption.
        // The demo keeps the two distinct so nobody mistakes them for one field.
        $this->member('demo.committee', 'Camille', 'Committee', $sections['Trombones']->id, [
            'committee_function_id' => CommitteeFunction::where('name', 'Responsable intendance')->value('id'),
        ])->roles()->syncWithoutDetaching([$committee->id]);

        // A young member whose parent uses the login. Every member has an
        // account (ADR 0015): the roster is the people the band tracks for
        // events. People the band only displays (instructors, honorary
        // members) are content, not members.
        //
        // The account is in use, so it has a last login (#148). Only logging
        // in writes that column, so it is not fillable and is forced here, on
        // creation only like every other attribute this seeder sets.
        $young = $this->member('demo.young', 'Nadia', 'Sansconnexion', $sections['Batteurs']->id);
        if ($young->wasRecentlyCreated) {
            $young->forceFill(['last_login_at' => '2026-09-12 18:05:00'])->save();
        }
    }

    /**
     * @param  array<string, mixed>  $extra  Applied on creation only, like every
     *                                       other attribute here: firstOrCreate
     *                                       leaves an existing row alone, so the
     *                                       seeder never undoes a developer's
     *                                       hand-edits (DevSeederTest). An
     *                                       attribute added later does not reach
     *                                       an already seeded database; re-seed
     *                                       from empty, or set it in DbGate.
     */
    private function member(string $username, string $first, string $last, ?int $sectionId, array $extra = []): Member
    {
        $member = Member::firstOrCreate(
            ['username' => $username],
            [
                'first_name' => $first,
                'last_name' => $last,
                'section_id' => $sectionId,
                'password' => 'demo',
                'public_visible' => true,
                ...$extra,
            ],
        );

        // Every account holds the baseline. A persona with a register also
        // gets `musician` here, since the register grants nothing.
        $member->roles()->syncWithoutDetaching(array_filter([
            Role::baseline()->id,
            $sectionId !== null ? Role::where('key', 'musician')->value('id') : null,
        ]));

        return $member;
    }
}

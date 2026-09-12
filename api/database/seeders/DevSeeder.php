<?php

namespace Database\Seeders;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use Illuminate\Database\Seeder;

/**
 * Local development and test data. SYNTHETIC ONLY — never a real member's name
 * and never a real password.
 *
 * Idempotent, because the dev container runs migrations (and may run this) on
 * every start.
 */
class DevSeeder extends Seeder
{
    public function run(): void
    {
        // Belt-and-braces: this seeder ships to every deployed environment
        // (only tests/ is excluded from the build artifact, not
        // database/seeders/), and nothing must ever be able to invoke it
        // there and create demo.* accounts with a known password on a real
        // server. Nothing currently does, but this must hold regardless.
        if (app()->isProduction()) {
            return;
        }

        // The registers come from the 2026_09_07_000001 migration now — they
        // are reference data, not fixtures. Assigning demo members to the REAL
        // registers also means the dev stack renders the same register list a
        // server does, which is what makes a local screenshot worth anything.
        $sections = Section::orderBy('sort_order')->get()->keyBy('name');

        // The roles come from the migration too. firstOrCreate here would
        // create a SECOND role with the same key on a database where the
        // migration had run — and syncPermissions would undo a developer's
        // hand-edits, which is the thing DevSeederTest pins.
        $direction = Role::where('key', 'direction')->sole();
        $committee = Role::where('key', 'committee')->sole();

        // Organises, does not play: no register, so never in an attendance list.
        $this->member('demo.direction', 'Dominique', 'Direction', null)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // Plays, organises nothing.
        $this->member('demo.player', 'Perrine', 'Player', $sections['Cloches']->id);

        // BOTH — the case the old role matrix could not express. If someone
        // reintroduces an either/or, this member is what breaks.
        //
        // ALSO THE ONE INSTRUCTOR, and that is what makes the public band page
        // renderable in development: `instructor_of_section_id` is a different
        // column from `section_id`, so Bastien is listed as a player under the
        // trumpets and as an instructor under the drums. With nobody teaching
        // anything, that branch of the page could only be looked at on a
        // server.
        $this->member('demo.both', 'Bastien', 'Both', $sections['Trompettes']->id, [
            'instructor_of_section_id' => $sections['Batteurs']->id,
        ])->roles()->syncWithoutDetaching([$direction->id]);

        // Holds the committee role and plays: the guest list is the only
        // thing they can see, and they are still in the attendance list.
        //
        // The TITLE is what puts them on the public committee page, and it is
        // deliberately not the same thing as the role: `committee` grants
        // `registrations.view`, while 'Responsable intendance' is free text the
        // committee typed and the site renders verbatim. One is authorisation
        // and the other is a caption, and a demo roster where they coincide is
        // how somebody comes to believe they are one field.
        $this->member('demo.committee', 'Camille', 'Committee', $sections['Trombones']->id, [
            'committee_title' => 'Responsable intendance',
        ])->roles()->syncWithoutDetaching([$committee->id]);

        // A young member whose PARENT uses the login on their behalf. Every
        // member has an account (2026_09_08_000001): the roster is the people
        // the band tracks for events, and all of them are answerable. People
        // the band merely displays — instructors, honorary members — are
        // content and are not members at all.
        $this->member('demo.young', 'Nadia', 'Sansconnexion', $sections['Batteurs']->id);
    }

    /**
     * @param  array<string, mixed>  $extra  Applied ON CREATION ONLY, like every
     *                                       other attribute here: firstOrCreate
     *                                       leaves an existing row alone, which
     *                                       is what stops this seeder undoing a
     *                                       developer's hand-edits (DevSeederTest
     *                                       pins that). A database seeded before
     *                                       one of these was added therefore does
     *                                       not gain it — re-seed from empty, or
     *                                       set it in DbGate.
     */
    private function member(string $username, string $first, string $last, ?int $sectionId, array $extra = []): Member
    {
        return Member::firstOrCreate(
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
    }
}

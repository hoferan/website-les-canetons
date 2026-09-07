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
        $this->member('demo.both', 'Bastien', 'Both', $sections['Trompettes']->id)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // Holds the committee role and plays: the guest list is the only
        // thing they can see, and they are still in the attendance list.
        $this->member('demo.committee', 'Camille', 'Committee', $sections['Trombones']->id)
            ->roles()->syncWithoutDetaching([$committee->id]);

        // A person with no account at all: listed publicly, never logs in.
        Member::firstOrCreate(
            ['first_name' => 'Nadia', 'last_name' => 'Sansconnexion'],
            [
                'section_id' => $sections['Batteurs']->id,
                'public_visible' => true,
            ],
        );
    }

    private function member(string $username, string $first, string $last, ?int $sectionId): Member
    {
        return Member::firstOrCreate(
            ['username' => $username],
            [
                'first_name' => $first,
                'last_name' => $last,
                'section_id' => $sectionId,
                'password' => 'demo',
                'public_visible' => true,
            ],
        );
    }
}

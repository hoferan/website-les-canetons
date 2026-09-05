<?php

namespace Database\Seeders;

use App\Models\Member;
use App\Models\Role;
use App\Models\Section;
use App\Support\Permission;
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
        $sections = collect([
            'Trompettes' => 1,
            'Trombones' => 2,
            'Clarinettes' => 3,
            'Percussions' => 4,
        ])->mapWithKeys(fn (int $order, string $name) => [
            $name => Section::firstOrCreate(['name' => $name], ['sort_order' => $order]),
        ]);

        $direction = Role::firstOrCreate(
            ['key' => 'direction'],
            ['label_fr' => 'Team Direction'],
        );
        $direction->syncPermissions([
            Permission::EventsManage,
            Permission::AttendanceViewAll,
            Permission::AttendanceRecordForOthers,
            Permission::MembersManage,
            Permission::RegistrationsView,
        ]);

        $committee = Role::firstOrCreate(
            ['key' => 'committee'],
            ['label_fr' => 'Comité'],
        );
        $committee->syncPermissions([Permission::RegistrationsView]);

        // Organises, does not play: no register, so never in an attendance list.
        $this->member('demo.direction', 'Dominique', 'Direction', null)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // Plays, organises nothing.
        $this->member('demo.player', 'Perrine', 'Player', $sections['Clarinettes']->id);

        // BOTH — the case the old role matrix could not express. If someone
        // reintroduces an either/or, this member is what breaks.
        $this->member('demo.both', 'Bastien', 'Both', $sections['Trompettes']->id)
            ->roles()->syncWithoutDetaching([$direction->id]);

        // A person with no account at all: listed publicly, never logs in.
        Member::firstOrCreate(
            ['first_name' => 'Nadia', 'last_name' => 'Sansconnexion'],
            [
                'section_id' => $sections['Percussions']->id,
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

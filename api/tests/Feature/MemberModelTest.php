<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Section;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MemberModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_cannot_exist_without_an_account(): void
    {
        // INVERTED on 2026-09-08. This test used to assert the opposite, and
        // that model is what allowed a "ghost administrator": somebody holding
        // members.manage who could not log in, so deleting the only real
        // administrator passed every invariant and locked the band out.
        //
        // The roster is now the people the band TRACKS FOR EVENTS, and all of
        // them have an account — a young member's parent uses their login on
        // their behalf. People the band merely DISPLAYS are content, not rows
        // here.
        $this->expectException(QueryException::class);

        Member::create([
            'first_name' => 'Marie',
            'last_name' => 'Rossier',
            'public_visible' => true,
        ]);
    }

    public function test_two_members_cannot_share_a_username(): void
    {
        // Replaces a test that asserted MariaDB permits many NULLs under one
        // unique index — true, and no longer relevant now that the column is
        // NOT NULL. What the index is actually for is this.
        Member::create([
            'first_name' => 'A',
            'last_name' => 'One',
            'username' => 'shared',
            'password' => 'secret123',
        ]);

        $this->expectException(QueryException::class);

        Member::create([
            'first_name' => 'B',
            'last_name' => 'Two',
            'username' => 'shared',
            'password' => 'secret123',
        ]);
    }

    public function test_the_password_is_stored_hashed(): void
    {
        $member = Member::create([
            'first_name' => 'Léa',
            'last_name' => 'Keller',
            'username' => 'lea.keller',
            'password' => 'plain-text-secret',
        ]);

        $this->assertNotSame('plain-text-secret', $member->password);
        $this->assertTrue(Hash::check('plain-text-secret', $member->password));
    }

    public function test_deleting_a_section_leaves_its_members_sectionless(): void
    {
        $section = Section::create(['name' => 'Clarinettes', 'sort_order' => 1]);
        $member = Member::create([
            'first_name' => 'Nina',
            'last_name' => 'Bersier',
            'section_id' => $section->id,
            'username' => 'nina.bersier',
            'password' => 'secret123',
        ]);

        $section->delete();

        $this->assertNull($member->fresh()->section_id);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Section;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class MemberModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_can_exist_without_an_account(): void
    {
        $member = Member::create([
            'first_name' => 'Marie',
            'last_name' => 'Rossier',
            'public_visible' => true,
        ]);

        $this->assertNull($member->username);
        $this->assertNull($member->password);
        $this->assertTrue($member->public_visible);
    }

    public function test_more_than_one_member_may_have_no_username(): void
    {
        Member::create(['first_name' => 'A', 'last_name' => 'One']);
        Member::create(['first_name' => 'B', 'last_name' => 'Two']);

        $this->assertSame(2, Member::whereNull('username')->count());
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
        ]);

        $section->delete();

        $this->assertNull($member->fresh()->section_id);
    }
}

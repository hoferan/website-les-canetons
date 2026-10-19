<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Models\Section;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The model and its schema, not the API.
 *
 * Rows are built by hand, without MemberFactory: these tests are about the raw
 * shape (mandatory credentials, a unique username, a password hashed on save),
 * and a factory would supply the valid defaults they must not assume.
 */
class MemberModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_cannot_exist_without_an_account(): void
    {
        // A member without credentials could hold members.manage and be unable
        // to log in, so deleting the only real administrator would lock the
        // band out. The roster is the people the band tracks for events, and
        // all of them have an account (a young member's parent uses their
        // login). People the band only displays are content, not rows here.
        $this->expectException(QueryException::class);

        Member::create([
            'first_name' => 'Marie',
            'last_name' => 'Rossier',
            'public_visible' => true,
        ]);
    }

    public function test_two_members_cannot_share_a_username(): void
    {
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

<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Support\SessionRevoker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SessionRevocationTest extends TestCase
{
    use RefreshDatabase;

    private function member(string $username): Member
    {
        return Member::create([
            'first_name' => 'Demo',
            'last_name' => ucfirst($username),
            'username' => $username,
            'password' => 'secret123',
        ]);
    }

    /**
     * Writes a row shaped like Laravel's database session handler's, so the
     * test exercises the real table rather than a stand-in. phpunit.xml runs
     * SESSION_DRIVER=array, so nothing else populates this table here.
     */
    private function seedSession(string $id, ?int $memberId): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $memberId,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])),
            'last_activity' => time(),
        ]);
    }

    public function test_it_deletes_only_that_members_sessions(): void
    {
        $lea = $this->member('lea');
        $marc = $this->member('marc');

        $this->seedSession('session-lea-phone', $lea->id);
        $this->seedSession('session-lea-laptop', $lea->id);
        $this->seedSession('session-marc', $marc->id);

        $deleted = SessionRevoker::forMember($lea->id);

        $this->assertSame(2, $deleted);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $lea->id)->count());
        $this->assertSame(1, DB::table('sessions')->where('user_id', $marc->id)->count());
    }

    public function test_it_leaves_anonymous_sessions_alone(): void
    {
        $lea = $this->member('lea');
        $this->seedSession('session-anonymous', null);
        $this->seedSession('session-lea', $lea->id);

        SessionRevoker::forMember($lea->id);

        $this->assertSame(1, DB::table('sessions')->whereNull('user_id')->count());
    }

    public function test_it_is_safe_when_there_is_nothing_to_revoke(): void
    {
        $this->assertSame(0, SessionRevoker::forMember(999));
    }

    public function test_deleting_a_member_cascades_nothing_onto_sessions(): void
    {
        // sessions has no foreign key to members, so the row survives the
        // delete — which is exactly why SessionRevoker must be called
        // explicitly, and why this test exists to state it.
        $lea = $this->member('lea');
        $this->seedSession('session-lea', $lea->id);

        $lea->delete();

        $this->assertSame(1, DB::table('sessions')->where('user_id', $lea->id)->count());
    }
}

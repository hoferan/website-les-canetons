<?php

namespace Tests\Feature;

use App\Models\Member;
use App\Support\EffectivePermissions;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * The chicken-and-egg problem this solves: /members is gated on
 * members.manage, so somebody must already hold it before anybody can grant it
 * — and the host has no shell to create that first person with.
 *
 * The migration reads BOOTSTRAP_ADMIN_* from the server's own .env, which is
 * the file each server already owns by hand, and does nothing at all unless
 * administration is genuinely unheld. Under phpunit.xml those keys are unset,
 * so the migration no-ops for the whole suite and these tests drive it
 * directly with config().
 */
class BootstrapAdministratorTest extends TestCase
{
    use RefreshDatabase;

    private function runBootstrap(): void
    {
        // The migration has already run (RefreshDatabase) and no-opped, so
        // invoke the class directly rather than re-running `migrate`, which
        // would find nothing pending.
        $migration = require database_path(
            'migrations/2026_09_07_000002_bootstrap_first_administrator.php',
        );
        $migration->up();
    }

    public function test_it_creates_an_administrator_from_the_environment(): void
    {
        config([
            'bootstrap.admin.username' => 'comite',
            'bootstrap.admin.password' => 'a-long-enough-secret',
            'bootstrap.admin.first_name' => 'Comité',
            'bootstrap.admin.last_name' => 'Canetons',
        ]);

        $this->runBootstrap();

        $member = Member::where('username', 'comite')->sole();

        $this->assertSame('Comité', $member->first_name);
        $this->assertSame('Canetons', $member->last_name);
        $this->assertTrue(Hash::check('a-long-enough-secret', $member->password));
        $this->assertTrue(
            $member->must_change_password,
            'a password that was typed into a .env file must be changed on first login',
        );
        $this->assertFalse(
            $member->public_visible,
            'publication is opt-in per person; a bootstrap account has consented to nothing',
        );
        $this->assertNull(
            $member->section_id,
            'the bootstrap account administers; it does not play, so it must not '.
            'appear in an attendance list as "sans réponse"',
        );
        $this->assertTrue($member->hasPermission(Permission::MembersManage));
    }

    public function test_it_does_nothing_when_an_administrator_already_exists(): void
    {
        config([
            'bootstrap.admin.username' => 'comite',
            'bootstrap.admin.password' => 'a-long-enough-secret',
            'bootstrap.admin.first_name' => 'Comité',
            'bootstrap.admin.last_name' => 'Canetons',
        ]);
        $this->runBootstrap();

        // A second run, as a redeploy would do.
        $this->runBootstrap();

        $this->assertSame(1, Member::where('username', 'comite')->count());
    }

    public function test_it_does_nothing_when_the_environment_is_unset(): void
    {
        config([
            'bootstrap.admin.username' => null,
            'bootstrap.admin.password' => null,
        ]);

        $this->runBootstrap();

        $this->assertSame(0, Member::count());
    }

    public function test_it_refuses_a_short_password_rather_than_creating_a_weak_account(): void
    {
        config([
            'bootstrap.admin.username' => 'comite',
            'bootstrap.admin.password' => 'short',
            'bootstrap.admin.first_name' => 'Comité',
            'bootstrap.admin.last_name' => 'Canetons',
        ]);

        // Failing loudly is the right answer: a migration that quietly skipped
        // would leave a server with no way in and no message saying why, and
        // one that created the account anyway would put a five-character
        // password on the only account that can administer the band.
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('BOOTSTRAP_ADMIN_PASSWORD');

        $this->runBootstrap();
    }

    public function test_an_existing_holder_of_members_manage_counts_as_bootstrapped(): void
    {
        // Not merely "a member exists" — the guard is whether ADMINISTRATION is
        // held. A database full of players with no administrator still needs
        // this migration to run.
        config([
            'bootstrap.admin.username' => 'comite',
            'bootstrap.admin.password' => 'a-long-enough-secret',
            'bootstrap.admin.first_name' => 'Comité',
            'bootstrap.admin.last_name' => 'Canetons',
        ]);

        Member::factory()->named('Perrine', 'Player', 'perrine')->create();

        $this->runBootstrap();

        $this->assertSame(
            1,
            Member::where('username', 'comite')->count(),
            'a player without members.manage must not stop the bootstrap',
        );
        $this->assertTrue(
            EffectivePermissions::memberIdsWith(Permission::MembersManage)->isNotEmpty(),
        );
    }
}

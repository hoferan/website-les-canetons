<?php

use App\Auth;
use App\Repositories\UserRepository;

final class AuthLoginTest extends IntegrationTestCase
{
    protected function tearDown(): void
    {
        parent::tearDown();
        $_SESSION = [];
    }

    public function testLegacyPlaintextPasswordLogsInAndUpgradesStoredHash(): void
    {
        // Seed data stores 'demo' as plaintext for every synthetic account.
        $role = Auth::attemptLogin('demo.user', 'demo');

        $this->assertSame('user', $role);

        $repo = new UserRepository($this->db);
        $stored = $repo->findByUsername('demo.user')['password'];
        $this->assertTrue(password_verify('demo', $stored));
        $this->assertNotSame('demo', $stored);
    }

    public function testLegacyUpgradeWriteFailureDoesNotBlockLogin(): void
    {
        // Force the rehash UPDATE that Auth::attemptLogin() issues to fail
        // with a real mysqli_sql_exception (matching what Database::connect()'s
        // strict mode throws on any DB error), simulating a transient failure
        // (e.g. a read-only replica). A BEFORE UPDATE trigger that always
        // SIGNALs an error is the most direct way to force a genuine DB write
        // failure here without a mocking framework -- UserRepository is
        // constructed internally by Auth::attemptLogin(), so there's no seam
        // to inject a fake repository, and this project tests exclusively
        // against a real MariaDB (see IntegrationTestCase).
        $this->db->query(
            'CREATE TRIGGER force_update_password_failure '
            . 'BEFORE UPDATE ON users FOR EACH ROW '
            . "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Simulated DB failure'"
        );

        try {
            // Seed data stores 'demo' as plaintext for every synthetic account,
            // so this still takes the legacy-upgrade branch and attempts the
            // (now-failing) rehash write.
            $role = Auth::attemptLogin('demo.user', 'demo');

            $this->assertSame('user', $role);

            // The write failed, so the stored password must remain unchanged --
            // proving the trigger really intercepted the UPDATE rather than the
            // assertion above passing for an unrelated reason.
            $repo = new UserRepository($this->db);
            $stored = $repo->findByUsername('demo.user')['password'];
            $this->assertSame('demo', $stored);
        } finally {
            $this->db->query('DROP TRIGGER IF EXISTS force_update_password_failure');
        }
    }

    public function testAlreadyHashedPasswordVerifiesDirectly(): void
    {
        $repo = new UserRepository($this->db);
        $repo->updatePassword(1, password_hash('s3cr3t-pass', PASSWORD_DEFAULT));

        $role = Auth::attemptLogin('demo.user', 's3cr3t-pass');

        $this->assertSame('user', $role);
    }

    public function testWrongPasswordFails(): void
    {
        $this->assertNull(Auth::attemptLogin('demo.user', 'not-the-password'));
    }

    public function testUnknownUsernameFails(): void
    {
        $this->assertNull(Auth::attemptLogin('nobody.here', 'demo'));
    }
}

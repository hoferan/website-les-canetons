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

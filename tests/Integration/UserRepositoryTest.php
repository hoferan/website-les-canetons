<?php

use App\Repositories\UserRepository;

final class UserRepositoryTest extends IntegrationTestCase
{
    public function testFindByUsernameReturnsSeededUser(): void
    {
        $repo = new UserRepository($this->db);
        $user = $repo->findByUsername('demo.admin');

        $this->assertNotNull($user);
        $this->assertSame('admin', $user['role']);
        $this->assertSame('demo', $user['password']);
    }

    public function testFindByUsernameReturnsNullForUnknownUser(): void
    {
        $repo = new UserRepository($this->db);

        $this->assertNull($repo->findByUsername('does.not.exist'));
    }

    public function testFindByUsernameIncludesId(): void
    {
        $repo = new UserRepository($this->db);

        $user = $repo->findByUsername('demo.user');

        $this->assertSame(1, $user['id']);
    }

    public function testUpdatePasswordChangesStoredHash(): void
    {
        $repo = new UserRepository($this->db);
        $hash = password_hash('new-secret', PASSWORD_DEFAULT);

        $repo->updatePassword(1, $hash);

        $this->assertSame($hash, $repo->findByUsername('demo.user')['password']);
    }
}

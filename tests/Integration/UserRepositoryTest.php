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
}

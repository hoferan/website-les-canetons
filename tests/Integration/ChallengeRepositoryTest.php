<?php

use App\Repositories\ChallengeRepository;

/**
 * used_challenges is not in the test DB's base schema (it ships via migration
 * 002), and DDL implicitly commits — escaping IntegrationTestCase's rollback.
 * So, like MigratorTest, this test creates the table if needed and cleans its
 * own 'test-%' rows explicitly.
 */
final class ChallengeRepositoryTest extends IntegrationTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->db->query(
            'CREATE TABLE IF NOT EXISTS used_challenges ('
            . '`signature` char(64) NOT NULL, '
            . '`created_at` timestamp NOT NULL DEFAULT current_timestamp(), '
            . 'PRIMARY KEY (`signature`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;'
        );
        $this->cleanup();
    }

    protected function tearDown(): void
    {
        $this->cleanup();
        parent::tearDown();
    }

    private function cleanup(): void
    {
        $this->db->query("DELETE FROM used_challenges WHERE signature LIKE 'test-%'");
    }

    public function testFirstConsumeSucceedsSecondIsReplay(): void
    {
        $repo = new ChallengeRepository($this->db);
        $sig = 'test-' . str_repeat('a', 59); // 64 chars

        $this->assertTrue($repo->consume($sig), 'first use should be accepted');
        $this->assertFalse($repo->consume($sig), 'second use is a replay');
    }
}

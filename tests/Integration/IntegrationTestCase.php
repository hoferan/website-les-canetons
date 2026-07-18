<?php

use PHPUnit\Framework\TestCase;

/**
 * Base class for tests hitting a real MariaDB. Connects once to a dedicated
 * test database (never the dev/prod one) and wraps each test in a
 * transaction that's rolled back afterward, so tests don't leak state or
 * depend on run order. Point TEST_DB_* env vars elsewhere if needed.
 */
abstract class IntegrationTestCase extends TestCase
{
    protected mysqli $db;

    protected function setUp(): void
    {
        $this->db = Database::connect([
            'host'    => getenv('TEST_DB_HOST') ?: '127.0.0.1',
            'user'    => getenv('TEST_DB_USER') ?: 'canetons',
            'pass'    => getenv('TEST_DB_PASS') ?: 'canetons',
            'name'    => getenv('TEST_DB_NAME') ?: 'lescanetons_test',
            'charset' => 'utf8mb4',
        ]);
        $this->db->begin_transaction();
    }

    protected function tearDown(): void
    {
        $this->db->rollback();
    }
}

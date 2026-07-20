<?php

namespace App\Repositories;

use mysqli;

/**
 * Single-use store for solved Altcha challenge signatures (replay protection).
 * INSERT IGNORE + affected_rows avoids any dependency on mysqli error mode.
 */
final class ChallengeRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /** @return bool true if newly consumed; false if the signature was already used (replay). */
    public function consume(string $signature): bool
    {
        // Opportunistic prune — solved challenges expire well within a day.
        $this->db->query(
            'DELETE FROM used_challenges WHERE created_at < (NOW() - INTERVAL 1 DAY)'
        );

        $stmt = $this->db->prepare('INSERT IGNORE INTO used_challenges (signature) VALUES (?)');
        $stmt->bind_param('s', $signature);
        $stmt->execute();
        $inserted = $this->db->affected_rows === 1;
        $stmt->close();

        return $inserted;
    }
}

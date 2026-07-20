<?php

namespace App\Repositories;

use mysqli;

final class UserRepository
{
    public function __construct(private mysqli $db)
    {
    }

    /**
     * Look up a user by username.
     * Returns ['id' => ..., 'username' => ..., 'password' => ..., 'role' => ...] or null.
     */
    public function findByUsername(string $username): ?array
    {
        $sql = "SELECT id, username, password, role FROM users WHERE username = ? LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** Overwrite a user's stored password value (already hashed by the caller). */
    public function updatePassword(int $id, string $hash): void
    {
        $stmt = $this->db->prepare('UPDATE users SET password = ? WHERE id = ?');
        $stmt->bind_param('si', $hash, $id);
        $stmt->execute();
        $stmt->close();
    }
}

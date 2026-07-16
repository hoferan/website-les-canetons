<?php

final class UserRepository
{
    public function __construct(private mysqli $db) {}

    /**
     * Look up a user by username.
     * Returns ['username' => ..., 'password' => ..., 'role' => ...] or null.
     */
    public function findByUsername(string $username): ?array
    {
        $sql = "SELECT username, password, role FROM users WHERE username = ? LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }
}

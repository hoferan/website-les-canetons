<?php

// This buildless app wires classes together with plain `require` includes (see
// bootstrap.php) rather than namespaced autoloading, so this class intentionally
// stays in the global namespace. Namespacing it would mean also updating every
// unqualified reference across code/**.php — out of scope for a formatting-only
// PSR-12 pass with no test coverage to verify the refactor.
// phpcs:ignore PSR1.Classes.ClassDeclaration.MissingNamespace
final class UserRepository
{
    public function __construct(private mysqli $db)
    {
    }

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

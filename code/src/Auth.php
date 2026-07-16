<?php

// This buildless app wires classes together with plain `require` includes (see
// bootstrap.php) rather than namespaced autoloading, so this class intentionally
// stays in the global namespace. Namespacing it would mean also updating every
// unqualified reference across code/**.php — out of scope for a formatting-only
// PSR-12 pass with no test coverage to verify the refactor.
// phpcs:ignore PSR1.Classes.ClassDeclaration.MissingNamespace
final class Auth
{
    // Capability matrix — the single source of truth for what each role may do.
    // NOT a hierarchy: admin manages events/summary but cannot respond; a
    // user/moderator responds but cannot manage. (assets/js/session.js mirrors this.)
    private const CAPABILITIES = [
        'user'      => ['respond'],
        'moderator' => ['respond'],
        'admin'     => ['manage_events', 'view_summary'],
    ];

    /** Pure, session-free: does $role hold $capability? Unknown role -> false. */
    public static function roleCan(?string $role, string $capability): bool
    {
        return in_array($capability, self::CAPABILITIES[$role] ?? [], true);
    }

    /** Roles that hold $capability. Source of truth for role-based filtering. */
    public static function rolesWithCapability(string $capability): array
    {
        $roles = [];
        foreach (self::CAPABILITIES as $role => $caps) {
            if (in_array($capability, $caps, true)) {
                $roles[] = $role;
            }
        }
        return $roles;
    }

    public static function canManageEvents(): bool
    {
        return self::roleCan(self::role(), 'manage_events');
    }

    public static function canViewSummary(): bool
    {
        return self::roleCan(self::role(), 'view_summary');
    }

    public static function canRespond(): bool
    {
        return self::roleCan(self::role(), 'respond');
    }

    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        session_set_cookie_params([
            'httponly' => true,
            'samesite' => 'Lax',
            'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        ]);
        session_start();
    }

    /**
     * Verify credentials server-side. On success, store identity in the session
     * and return the role. Returns null on failure.
     */
    public static function attemptLogin(string $username, string $password): ?string
    {
        $repo = new UserRepository(Database::get());
        $user = $repo->findByUsername($username);
        if ($user === null) {
            return null;
        }
        // Plaintext comparison for now. Hashing will return alongside a proper
        // user-management UI (see sql/v2_schema.sql, `password` column).
        if ($user['password'] !== $password) {
            return null;
        }
        self::startSession();
        session_regenerate_id(true);
        $_SESSION['user'] = ['username' => $username, 'role' => $user['role']];
        return $user['role'];
    }

    public static function check(): bool
    {
        self::startSession();
        return isset($_SESSION['user']);
    }

    public static function user(): ?array
    {
        self::startSession();
        return $_SESSION['user'] ?? null;
    }

    public static function role(): ?string
    {
        return self::user()['role'] ?? null;
    }

    public static function logout(): void
    {
        self::startSession();
        $_SESSION = [];
        session_destroy();
    }

    /** Guard for API endpoints: 401 if not logged in. */
    public static function requireLogin(): void
    {
        if (!self::check()) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Non authentifié']);
            exit;
        }
    }

    /** Guard for API endpoints: 401 if not logged in, 403 if role lacks $capability. */
    private static function requireCapability(string $capability): void
    {
        self::requireLogin();
        if (!self::roleCan(self::role(), $capability)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Accès refusé']);
            exit;
        }
    }

    public static function requireCanManageEvents(): void
    {
        self::requireCapability('manage_events');
    }
    public static function requireCanViewSummary(): void
    {
        self::requireCapability('view_summary');
    }
    public static function requireCanRespond(): void
    {
        self::requireCapability('respond');
    }

    /** Guard for pages: redirect to login if not logged in. */
    public static function requireLoginPage(string $returnTo): void
    {
        if (!self::check()) {
            header('Location: authentification_inscription.php?returnTo=' . urlencode($returnTo));
            exit;
        }
    }
}

<?php

namespace App;

/**
 * Session-reading capability checks for the old app's server-rendered pages.
 *
 * Login, logout and the JSON API guards have moved to Laravel (`api/`): the
 * Sanctum-backed `POST /api/login` / `POST /api/logout` own authentication, and
 * `App\Http\JsonResponse`-based `requireLogin()` / `requireCanX()` guards are
 * gone along with the `app/api/*.php` handlers that were their only callers.
 *
 * The `$_SESSION['user']` array this class reads is therefore no longer written
 * here — Laravel's `App\Support\LegacySession` bridge writes it on login and
 * clears it on logout. This class only *reads* that session, so the remaining
 * pages under `app/pages/` and `app/partials/` keep gating exactly as before.
 *
 * The CAPABILITIES matrix stays the source of truth for those pages;
 * `app/assets/js/session.js` mirrors it on the client.
 *
 * Sub-project 3 retires this class together with the `$_SESSION` pages.
 */
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

    /** Guard for pages: redirect to login if not logged in. */
    public static function requireLoginPage(string $returnTo): void
    {
        if (!self::check()) {
            header('Location: /authentification_inscription?returnTo=' . urlencode($returnTo));
            exit;
        }
    }
}

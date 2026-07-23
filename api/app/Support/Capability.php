<?php

namespace App\Support;

/**
 * Capability matrix — the single source of truth for what each role may do.
 * NOT a hierarchy: admin manages events/summary but cannot respond; a
 * user/moderator responds but cannot manage. Mirrors the old app's
 * App\Auth::CAPABILITIES exactly (same roles, same capabilities).
 */
final class Capability
{
    private const MATRIX = [
        'user'      => ['respond'],
        'moderator' => ['respond'],
        'admin'     => ['manage_events', 'view_summary'],
    ];

    public static function can(?string $role, string $capability): bool
    {
        return in_array($capability, self::MATRIX[$role] ?? [], true);
    }

    /** @return string[] */
    public static function rolesWith(string $capability): array
    {
        $roles = [];
        foreach (self::MATRIX as $role => $capabilities) {
            if (in_array($capability, $capabilities, true)) {
                $roles[] = $role;
            }
        }
        return $roles;
    }
}

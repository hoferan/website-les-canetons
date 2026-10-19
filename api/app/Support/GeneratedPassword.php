<?php

namespace App\Support;

use Random\Randomizer;
use RuntimeException;

/**
 * A committee-issued password, shown exactly once (ADR 0016).
 *
 * The alphabet matters most. This gets read out loud: an administrator opens a
 * member, hits "Réinitialiser le mot de passe" and reads the result down the
 * phone, or hands it on paper to a child who types it on a phone keyboard. So
 * every confusable pair is gone: 0/O, 1/l/I, 5/S, 2/Z. That leaves 27
 * characters, and 12 of them give roughly 57 bits, plenty for a credential
 * that lives only until must_change_password forces its replacement.
 *
 * Lower case only, and hyphen-grouped, for the same reason: nobody should
 * have to ask "was that a capital?" about something dictated, and a listener
 * needs to hear where they are in the string.
 *
 * Randomizer, not str_shuffle() or rand(): this is a credential, and PHP's
 * Randomizer defaults to the CSPRNG.
 */
final class GeneratedPassword
{
    /** 27 characters: no i, l, o, s, z, 0, 1, 2 or 5. */
    private const ALPHABET = 'abcdefghjkmnpqrtuvwxy346789';

    private const GROUPS = 3;

    private const GROUP_LENGTH = 4;

    /** Draws allowed before makeDifferentFrom() decides the caller is wrong, not unlucky. */
    private const MAX_DRAWS = 8;

    /**
     * A password this account is not already using (#92).
     *
     * A reissue that landed on the value already stored would hand an
     * administrator a password to dictate that changes nothing, and because
     * the reset also sets must_change_password, it would look like a fresh
     * credential while being one somebody has already heard. The odds are
     * about one reset in 10^17, but the guard makes "a reset issues a
     * different password" true by construction.
     *
     * $matchesCurrent answers the question, instead of this class taking a
     * hash, so this file stays free of the framework. The caller uses
     * Hash::check, which cannot drift from the driver that hashed the stored
     * value.
     *
     * $mint exists for the test that watches the collision branch run; the
     * real generator could never provoke one.
     *
     * @param  callable(string): bool  $matchesCurrent
     * @param  (callable(): string)|null  $mint
     *
     * @throws RuntimeException when the predicate refuses every candidate
     */
    public static function makeDifferentFrom(callable $matchesCurrent, ?callable $mint = null): string
    {
        $mint ??= static fn (): string => self::make();

        // Bounded, not `while (true)`. An inverted predicate would otherwise
        // hold a PHP-FPM worker on a shared host until max_execution_time ends
        // the request with nothing in the log naming the cause. Eight draws is
        // unreachable by chance and immediate when something is wrong.
        for ($attempt = 0; $attempt < self::MAX_DRAWS; $attempt++) {
            $candidate = $mint();

            if (! $matchesCurrent($candidate)) {
                return $candidate;
            }
        }

        throw new RuntimeException(
            'Could not mint a password different from the current one in '.self::MAX_DRAWS.' draws',
        );
    }

    public static function make(): string
    {
        $randomizer = new Randomizer;
        $last = strlen(self::ALPHABET) - 1;

        $groups = [];
        for ($group = 0; $group < self::GROUPS; $group++) {
            $characters = '';
            for ($i = 0; $i < self::GROUP_LENGTH; $i++) {
                $characters .= self::ALPHABET[$randomizer->getInt(0, $last)];
            }
            $groups[] = $characters;
        }

        return implode('-', $groups);
    }
}

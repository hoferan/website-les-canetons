<?php

namespace App\Support;

use Random\Randomizer;

/**
 * A committee-issued password, shown exactly once (§4.4).
 *
 * THE ALPHABET IS THE DESIGN. This gets read out loud — an administrator opens
 * a member, hits "Réinitialiser le mot de passe", and reads the result down the
 * phone, or hands it over on paper to a child who then types it on a phone
 * keyboard. So every confusable pair is gone: 0/O, 1/l/I, 5/S, 2/Z. What is
 * left is 27 characters, and 12 of them is roughly 57 bits — far more than
 * enough for a credential whose whole life is the minutes until
 * must_change_password forces it to be replaced.
 *
 * Lower case only, and hyphen-grouped, for the same reason: "was that a
 * capital?" is a question nobody should have to ask about something dictated,
 * and a listener needs to hear where they are in the string.
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

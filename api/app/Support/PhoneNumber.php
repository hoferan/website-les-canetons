<?php

namespace App\Support;

use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

/**
 * A guest's telephone number in E.164, when it can be read as one (#129).
 *
 * A companion, never a replacement. The number as the guest typed it stays in
 * `registrations.phone` and is what every screen, export and email shows.
 * Normalising against a default region can be wrong (a French `06 12 34 56 78`
 * reads as a valid Basel landline), and the stored text is the committee's
 * only copy, so this never overwrites it. What it adds is a dial string
 * without the trunk-prefix and punctuation guesses a `tel:` link made from
 * free text has to make.
 *
 * Switzerland by default, because the guests of a Fribourg souper are. A
 * number written with `+` or `00` is read in its own country. A national
 * number is read as Swiss, which is also what a Swiss phone dials when
 * somebody taps the number as typed, so this is never worse than a link made
 * from the typed text.
 *
 * Null wherever there is doubt, as `telHref()` in the SPA refuses: any letter
 * (`(privé)`, `p. 12`, `à demander`), a `+` that is not leading, or a number
 * the library does not consider valid. Null costs nothing, because the typed
 * number is still there to read.
 */
final class PhoneNumber
{
    private const REGION = 'CH';

    public static function e164(string $typed): ?string
    {
        $trimmed = trim($typed);

        if ($trimmed === '' || preg_match('/\p{L}/u', $trimmed) === 1 || str_contains(substr($trimmed, 1), '+')) {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();

        try {
            $number = $util->parse($trimmed, self::REGION);
        } catch (NumberParseException) {
            return null;
        }

        return $util->isValidNumber($number) ? $util->format($number, PhoneNumberFormat::E164) : null;
    }
}

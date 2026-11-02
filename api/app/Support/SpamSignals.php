<?php

namespace App\Support;

/**
 * Which fields of a public submission look like spam (#332).
 *
 * One signal for now: a link or markup, which a guest booking a table or
 * writing to the band has no reason to type. A match flags the submission,
 * which is still stored (ADR 0037). Nonsense names and repeated addresses
 * were left out because they catch real people too.
 */
final class SpamSignals
{
    /** `http://`, `https://`, `www.`, an HTML tag's `<`, or BBCode's `[url`. */
    private const LINK_OR_MARKUP = '/https?:\/\/|www\.|<|\[url/i';

    /**
     * The keys whose value carries a link or markup, in the order given.
     *
     * @param  array<string, string|null>  $fields
     * @return list<string>
     */
    public static function suspectFields(array $fields): array
    {
        $suspect = [];
        foreach ($fields as $field => $value) {
            if ($value !== null && preg_match(self::LINK_OR_MARKUP, $value) === 1) {
                $suspect[] = $field;
            }
        }

        return $suspect;
    }
}

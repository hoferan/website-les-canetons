<?php

namespace App\Support;

/**
 * The limits on a content block's `data`, which the server stores without
 * knowing what it means: an object of at most six levels, lists of at most 24
 * items, strings of at most 2000 characters, plain keys, 64 KB encoded.
 *
 * The limits keep one write from filling the table or the page, whatever the
 * block is. What a block holds is the SPA's business.
 */
final class BlockShape
{
    public const MAX_DEPTH = 6;

    public const MAX_ITEMS = 24;

    public const MAX_STRING = 2000;

    public const MAX_BYTES = 65536;

    /** Object keys: a letter, then letters and digits, 32 characters at most. */
    private const OBJECT_KEY = '/^[A-Za-z][A-Za-z0-9]{0,31}$/';

    public const NOT_AN_OBJECT = 'block_not_an_object';

    public const TOO_DEEP = 'block_too_deep';

    public const TOO_LONG = 'block_too_long';

    public const TOO_MANY = 'block_too_many';

    public const BAD_KEY = 'block_bad_key';

    public const TOO_LARGE = 'block_too_large';

    /**
     * Every token check() can return, for the vocabulary test to demand copy
     * for each one. They are paramless, because a closure rule cannot attach
     * params, and prefixed, because `too_long` is already taken by a token
     * that interpolates.
     */
    public const PROBLEMS = [
        self::NOT_AN_OBJECT,
        self::TOO_DEEP,
        self::TOO_LONG,
        self::TOO_MANY,
        self::BAD_KEY,
        self::TOO_LARGE,
    ];

    /** Null when `$data` fits, else the first problem's token. */
    public static function check(mixed $data): ?string
    {
        if (! is_array($data) || ($data !== [] && array_is_list($data))) {
            return self::NOT_AN_OBJECT;
        }

        return self::walk($data, 1)
            ?? (strlen((string) json_encode($data)) > self::MAX_BYTES ? self::TOO_LARGE : null);
    }

    private static function walk(mixed $value, int $depth): ?string
    {
        if (is_string($value)) {
            return mb_strlen($value) > self::MAX_STRING ? self::TOO_LONG : null;
        }

        if (! is_array($value)) {
            return null;
        }

        if ($depth > self::MAX_DEPTH) {
            return self::TOO_DEEP;
        }

        if (array_is_list($value)) {
            if (count($value) > self::MAX_ITEMS) {
                return self::TOO_MANY;
            }
        } else {
            foreach (array_keys($value) as $key) {
                if (preg_match(self::OBJECT_KEY, (string) $key) !== 1) {
                    return self::BAD_KEY;
                }
            }
        }

        foreach ($value as $item) {
            $problem = self::walk($item, $depth + 1);
            if ($problem !== null) {
                return $problem;
            }
        }

        return null;
    }
}

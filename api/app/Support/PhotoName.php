<?php

namespace App\Support;

/**
 * The rules for a library photo's name (#105), shared by the upload and the
 * rename so the two cannot drift.
 *
 * The name reaches a download's file name and the audit log as well as the
 * screen, so it may not carry control characters (a tab or a newline
 * included) or the bidirectional overrides and isolates that make a file name
 * read backwards. The zero-width joiner stays allowed, since emoji sequences
 * need it. A refusal is reported as `invalid_format`.
 */
final class PhotoName
{
    /** @var list<string> */
    public const RULES = [
        'required',
        'string',
        'max:120',
        'not_regex:/[\p{Cc}\x{200E}\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u',
    ];
}

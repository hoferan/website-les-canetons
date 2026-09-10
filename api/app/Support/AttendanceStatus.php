<?php

namespace App\Support;

/**
 * The two answers a member can give.
 *
 * TWO, NOT THREE. There is deliberately no "maybe" — see the attendance
 * migration for why a third option makes a chase list unanswerable.
 *
 * Stored and transmitted in ENGLISH, like every other machine value in this
 * API; `web/src/i18n/` is the only place Oui and Non exist. The old
 * `responses.answer` column already followed this rule with
 * `participate`/`notparticipate`, and these are the same values said shorter.
 */
enum AttendanceStatus: string
{
    case Yes = 'yes';
    case No = 'no';

    /**
     * For `in:` validation rules, so the accepted set is derived from this
     * enum rather than retyped in every Form Request.
     *
     * A string rule rather than Rule::enum(): App\Exceptions\ApiError maps the
     * `in` rule to `invalid_value` AND supplies its `allowed` parameter, while
     * an object rule arrives in failedRules keyed by class name and lands on
     * the paramless fallback — so Rule::enum() would tell a French reader
     * their answer "n'est pas dans un format valide" instead of listing what
     * is accepted.
     *
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $case): string => $case->value, self::cases());
    }

    /** The `in:` rule body, e.g. `in:yes,no`. */
    public static function rule(): string
    {
        return 'in:'.implode(',', self::values());
    }
}

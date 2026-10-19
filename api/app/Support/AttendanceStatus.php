<?php

namespace App\Support;

/**
 * Whether a member is coming to an event.
 */
enum AttendanceStatus: string
{
    // Only the docblock above is published: Scramble renders an enum's class
    // docblock as the schema description in api/openapi.json, so notes a
    // reader of the contract has no use for live here.
    //
    // Two answers, not three. There is deliberately no "maybe" (ADR 0018);
    // the attendance migration says why a third option makes a chase list
    // unanswerable.
    //
    // Stored and transmitted in English, like every other machine value in
    // this API; web/src/i18n/ is the only place Oui and Non exist.
    case Yes = 'yes';
    case No = 'no';

    /**
     * For `in:` validation rules, so the accepted set is derived from this
     * enum rather than retyped in every Form Request.
     *
     * A string rule rather than Rule::enum(): App\Exceptions\ApiError maps the
     * `in` rule to `invalid_value` and supplies its `allowed` parameter, while
     * an object rule arrives in failedRules keyed by class name and lands on
     * the paramless fallback. Rule::enum() would tell a French reader their
     * answer "n'est pas dans un format valide" instead of listing what is
     * accepted.
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

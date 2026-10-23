<?php

namespace App\Support;

/**
 * What one block of an event's booking form is (ADR 0032).
 *
 * The first four are answered by the guest; a heading or a paragraph is only
 * read. A quantity is the one kind that can be priced, capped and counted as
 * people, which is what every option was before the kinds existed.
 *
 * The values are stored, so renaming a case is a migration.
 */
enum OptionKind: string
{
    case Quantity = 'quantity';
    case Text = 'text';
    case Choice = 'choice';
    case YesNo = 'yes_no';
    case Heading = 'heading';
    case Paragraph = 'paragraph';

    /** Whether a guest answers this block, as opposed to only reading it. */
    public function isInput(): bool
    {
        return match ($this) {
            self::Quantity, self::Text, self::Choice, self::YesNo => true,
            self::Heading, self::Paragraph => false,
        };
    }

    /** @return list<self> */
    public static function inputs(): array
    {
        return array_values(array_filter(self::cases(), fn (self $kind): bool => $kind->isInput()));
    }
}

<?php

namespace App\Support;

use App\Models\Event;
use App\Models\Registration;

/**
 * The tables already booked at an event, for guests to pick from on its form.
 *
 * A table is its name (see TableName), so the list is the distinct names of
 * the current bookings. Cancelling a booking deletes it, which takes a junk
 * table name off the form with it. Grouped here rather than in SQL, whose
 * collation would merge "Müller" and "müller".
 *
 * Empty unless a public form asks for a table: a members form asks none
 * (ADR 0034), and a form without the field must not disclose the names.
 */
final class EventTables
{
    /** @return list<array{name: string, guests: int}> */
    public static function of(Event $event): array
    {
        if (! $event->registration_asks_table || $event->isMembersOnly()) {
            return [];
        }

        $guests = [];
        foreach ($event->registrations()->with('choices.option')->get() as $registration) {
            /** @var Registration $registration */
            $name = TableName::key($registration->table_name);
            if ($name !== null) {
                $guests[$name] = ($guests[$name] ?? 0) + $registration->guest_count;
            }
        }

        $tables = [];
        foreach ($guests as $name => $count) {
            // A name made of digits comes back from the array key as an int.
            $tables[] = ['name' => (string) $name, 'guests' => $count];
        }
        usort($tables, fn (array $a, array $b): int => NameOrder::compare($a['name'], $b['name']));

        return $tables;
    }
}

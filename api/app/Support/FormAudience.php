<?php

namespace App\Support;

/**
 * Who may fill in an event's booking form (#318, ADR 0034).
 *
 * A public form takes bookings from anybody, with contact details. A members
 * form takes one booking per account, with the name from the account and no
 * contact details, and does not exist for an anonymous caller.
 *
 * The values are stored, so renaming a case is a migration.
 */
enum FormAudience: string
{
    case Public = 'public';
    case Members = 'members';
}

<?php

namespace App\Support\Scramble;

use App\Support\Iso8601;
use Dedoc\Scramble\Extensions\TypeToSchemaExtension;
use Dedoc\Scramble\Support\Generator\Types\StringType;
use Dedoc\Scramble\Support\Type\Type;

/**
 * Publishes App\Support\Iso8601 as `{"type": "string", "format": "date-time"}`.
 *
 * ONE MECHANISM FOR NINE FIELDS. `startsAt`, `endsAt`, `registrationOpensAt`,
 * `registrationClosesAt`, `opensAt`, `closesAt`, `recordedAt`, `createdAt` and
 * `lastLoginAt` all left their Resources as bare PHP strings, so the document
 * described them as `string` while the REQUEST schemas for the very same fields
 * carried `format: date-time` — the accepted and the returned spellings of one
 * value, documented differently. Naming the rendered form gives every one of
 * them the format at once, and gives the tenth it for free.
 *
 * Scramble ships exactly this extension for CarbonInterface, which is not
 * usable here: a Resource returning a Carbon instance would serialise through
 * Carbon's own JSON form and lose the `+00:00` offset this API pins.
 *
 * Registered in config/scramble.php's `extensions` array, which IS the right
 * place for a type-to-schema extension — unlike an OperationExtension, which
 * that array accepts and never calls. See docs/traps.md.
 */
class Iso8601ToSchema extends TypeToSchemaExtension
{
    public function shouldHandle(Type $type): bool
    {
        return $type->isInstanceOf(Iso8601::class);
    }

    public function toSchema(Type $type): StringType
    {
        return (new StringType)->format('date-time');
    }
}

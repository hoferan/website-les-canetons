<?php

namespace App\Support\Scramble;

use App\Support\Iso8601;
use Dedoc\Scramble\Extensions\TypeToSchemaExtension;
use Dedoc\Scramble\Support\Generator\Types\StringType;
use Dedoc\Scramble\Support\Type\Type;

/**
 * Publishes App\Support\Iso8601 as `{"type": "string", "format": "date-time"}`.
 *
 * Every rendered timestamp (`startsAt`, `endsAt`, `createdAt`, `lastLoginAt`
 * and the rest) leaves its Resource as this type, so naming it here gives
 * each one the `format: date-time` its request schema already carries,
 * including any added later. A bare PHP string would be documented as a plain
 * `string`.
 *
 * Scramble ships exactly this extension for CarbonInterface, which is not
 * usable here: a Resource returning a Carbon instance would serialise through
 * Carbon's own JSON form and lose the `+00:00` offset this API pins.
 *
 * Registered in config/scramble.php's `extensions` array, where Scramble looks
 * for type-to-schema extensions.
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

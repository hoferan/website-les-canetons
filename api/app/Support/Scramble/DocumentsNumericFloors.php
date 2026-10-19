<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\Contracts\RuleTransformer;
use Dedoc\Scramble\Support\Generator\Types\IntegerType;
use Dedoc\Scramble\Support\Generator\Types\NumberType;
use Dedoc\Scramble\Support\Generator\Types\Type;
use Dedoc\Scramble\Support\RuleTransforming\NormalizedRule;
use Dedoc\Scramble\Support\RuleTransforming\RuleTransformerContext;

/**
 * Publishes the lower bound a `gt:` or `gte:` rule already enforces.
 *
 * Scramble maps `max:` onto `maximum` and drops both of these, so without this
 * the contract would advertise `quantity: 0` and `registrationMaxGuests: -5`
 * as valid against rules that reject them.
 *
 * The rules stay `gt:`/`gte:` rather than `min:`, which Scramble understands,
 * because App\Exceptions\ApiError::REASONS reserves `min` for the
 * string-length reading (Laravel reports numeric, string-length and
 * array-count minima all as `Min`, with nothing in failedRules to tell them
 * apart). A numeric `min` would tell a French reader their number "est trop
 * court".
 *
 * `minimum`, not `exclusiveMinimum`. Every field this reaches is an integer,
 * on which `gt:0` and `minimum: 1` describe the same set, and Scramble's
 * NumberType has no exclusive bound to set. A `gt:` on a fractional number is
 * left alone rather than published slightly too low, because a wrong bound is
 * worse than a missing one.
 */
class DocumentsNumericFloors implements RuleTransformer
{
    public function shouldHandle(NormalizedRule $rule): bool
    {
        return $rule->is('gt') || $rule->is('gte');
    }

    public function toSchema(Type $previous, NormalizedRule $rule, RuleTransformerContext $context): Type
    {
        if (! $previous instanceof NumberType) {
            return $previous;
        }

        // `gt:` takes either a number or the name of another field (`gt:total`
        // compares two inputs). Only a number is a bound this schema can carry;
        // a relationship between two properties cannot be stated in OpenAPI and
        // belongs in the field's description.
        $bound = $rule->getParameters()[0] ?? null;

        if (! is_numeric($bound)) {
            return $previous;
        }

        if ($rule->is('gte')) {
            return $previous->setMin(0 + $bound);
        }

        return $previous instanceof IntegerType
            ? $previous->setMin(1 + (int) $bound)
            : $previous;
    }
}

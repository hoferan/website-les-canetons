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
 * WHY THIS EXISTS. Scramble maps `max:` onto `maximum` and drops both of these,
 * so the contract advertised `quantity: 0` and `registrationMaxGuests: -5` as
 * valid against rules that reject them — an upper bound published and a lower
 * bound not, on the same field, in the same rule list. Six fields across four
 * Form Requests.
 *
 * WHY NOT SWITCH THE RULES TO `min:`, which Scramble already understands:
 * App\Exceptions\ApiError::REASONS reserves `min` for the string-length reading
 * (Laravel reports numeric, string-length and array-count minima all as `Min`,
 * with nothing in failedRules to tell them apart), so a numeric `min` would
 * tell a French reader that their number "est trop court". The rules are right
 * and the document was wrong.
 *
 * `minimum`, NOT `exclusiveMinimum`. Every field this reaches is an integer, on
 * which `gt:0` and `minimum: 1` describe exactly the same set — and Scramble's
 * NumberType has no exclusive bound to set, so the alternative was a parallel
 * type class for a distinction no field here can express. A `gt:` on a
 * fractional number is therefore left alone rather than published a hair too
 * low; there is no such field today, and a wrong bound is worse than a missing
 * one.
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

        // `gt:` takes EITHER a number or the name of another field — `gt:total`
        // is how Laravel compares two inputs. Only the first is a bound this
        // schema can carry; the second is a relationship between two properties,
        // which OpenAPI has no way to state and which belongs in the field's
        // description.
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

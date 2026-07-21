<?php

namespace App\Validation;

use Attribute;

/** The field's value must be strictly one of $choices. */
#[Attribute(Attribute::TARGET_PROPERTY | Attribute::TARGET_PARAMETER)]
final class OneOf
{
    public function __construct(public readonly array $choices)
    {
    }
}

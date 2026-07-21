<?php

namespace App\Validation;

use Attribute;

/** A present string field must not exceed $limit characters (mb_strlen). Non-string values are ignored — pair with Required/TypeString to also enforce type. */
#[Attribute(Attribute::TARGET_PROPERTY | Attribute::TARGET_PARAMETER)]
final class MaxLength
{
    public function __construct(public readonly int $limit)
    {
    }
}

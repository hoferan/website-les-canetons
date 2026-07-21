<?php

namespace App\Validation;

use Attribute;

/** If the field is present (not null), it must be a string. Passes silently when absent — pair with Required to also enforce presence. */
#[Attribute(Attribute::TARGET_PROPERTY | Attribute::TARGET_PARAMETER)]
final class TypeString
{
}

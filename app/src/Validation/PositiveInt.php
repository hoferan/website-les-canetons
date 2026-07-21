<?php

namespace App\Validation;

use Attribute;

/** The field must be present and, cast to int, greater than 0 (accepts an int or a numeric string). */
#[Attribute(Attribute::TARGET_PROPERTY | Attribute::TARGET_PARAMETER)]
final class PositiveInt
{
}

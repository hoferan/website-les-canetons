<?php

namespace App\Validation;

use Attribute;

/** The field must be present and a non-empty (after trim) string. */
#[Attribute(Attribute::TARGET_PROPERTY | Attribute::TARGET_PARAMETER)]
final class Required
{
}

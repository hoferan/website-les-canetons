<?php

namespace App\Validation;

use Attribute;

/** A present, non-empty string field must be a valid email address (FILTER_VALIDATE_EMAIL). */
#[Attribute(Attribute::TARGET_PROPERTY | Attribute::TARGET_PARAMETER)]
final class EmailFormat
{
}

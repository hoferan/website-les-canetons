<?php

namespace App\Dto;

use App\Validation\Required;

final class LoginInput
{
    public function __construct(
        #[Required] public readonly mixed $username,
        #[Required] public readonly mixed $password,
    ) {
    }
}

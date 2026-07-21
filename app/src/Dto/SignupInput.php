<?php

namespace App\Dto;

use App\Validation\{Required, MaxLength, EmailFormat};

final class SignupInput
{
    public function __construct(
        #[Required, MaxLength(255)] public readonly mixed $first_name,
        #[Required, MaxLength(255)] public readonly mixed $last_name,
        #[Required, MaxLength(255)] public readonly mixed $address,
        #[Required, MaxLength(64)] public readonly mixed $phone,
        #[Required, MaxLength(255), EmailFormat] public readonly mixed $email,
        #[Required, MaxLength(255)] public readonly mixed $table_name,
    ) {
    }
}

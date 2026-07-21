<?php

namespace App\Dto;

use App\Validation\{Required, MaxLength, EmailFormat};

final class ContactInput
{
    public function __construct(
        #[Required, MaxLength(255)] public readonly mixed $lastName,
        #[Required, MaxLength(255)] public readonly mixed $firstName,
        #[Required, MaxLength(255), EmailFormat] public readonly mixed $email,
        #[Required, MaxLength(255)] public readonly mixed $subject,
        #[Required] public readonly mixed $message,
    ) {
    }
}

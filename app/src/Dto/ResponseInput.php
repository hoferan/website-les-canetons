<?php

namespace App\Dto;

use App\Validation\{PositiveInt, Required, OneOf};

final class ResponseInput
{
    public function __construct(
        #[PositiveInt] public readonly mixed $eventId,
        #[Required, OneOf(['participate', 'notparticipate'])] public readonly mixed $participation,
    ) {
    }
}

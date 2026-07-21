<?php

namespace App\Dto;

use App\Validation\{Required, TypeString, MaxLength};

final class EventInput
{
    public function __construct(
        #[Required] public readonly mixed $date,
        #[Required, MaxLength(255)] public readonly mixed $title,
        #[Required] public readonly mixed $startTime,
        #[Required] public readonly mixed $endTime,
        #[Required, MaxLength(255)] public readonly mixed $location,
        #[TypeString, MaxLength(255)] public readonly mixed $attire,
        public readonly mixed $weekend = false,
    ) {
    }
}

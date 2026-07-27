<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Support\Altcha;

class AltchaController extends Controller
{
    /** Client-side proof-of-work cost, and how long a challenge stays valid. */
    public const MAX_NUMBER = 50000;

    public const TTL_SECONDS = 600;

    public function __invoke()
    {
        $secret = (string) config('app.altcha_secret');
        if ($secret === '' || $secret === 'CHANGE_ME') {
            return ApiError::json(503, 'service_unavailable', 'Service unavailable');
        }

        // PoW cost: up to 50k client-side SHA-256 iterations (a few thousand on
        // average) — light friction per submission; 10-minute expiry.
        return response()->json(
            (new Altcha($secret))->createChallenge(self::MAX_NUMBER, self::TTL_SECONDS)
        );
    }
}

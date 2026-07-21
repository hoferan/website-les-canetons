<?php

use App\Altcha;
use App\Http\JsonResponse;

global $config;

header('Content-Type: application/json');

$secret = (string) ($config['altcha']['hmac_secret'] ?? '');
if ($secret === '' || $secret === 'CHANGE_ME') {
    JsonResponse::error(503, 'service_unavailable', 'Service unavailable');
}

$altcha = new Altcha($secret);
// PoW cost: up to 50k client-side SHA-256 iterations (a few thousand on
// average) — light friction per submission; 10-minute expiry.
echo json_encode($altcha->createChallenge(50000, 600));

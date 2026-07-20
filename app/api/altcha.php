<?php

use App\Altcha;

global $config;

header('Content-Type: application/json');

$secret = (string) ($config['altcha']['hmac_secret'] ?? '');
if ($secret === '' || $secret === 'CHANGE_ME') {
    http_response_code(503);
    echo json_encode(['error' => 'Service indisponible']);
    return;
}

$altcha = new Altcha($secret);
// PoW cost: up to 50k client-side SHA-256 iterations (a few thousand on
// average) — light friction per submission; 10-minute expiry.
echo json_encode($altcha->createChallenge(50000, 600));

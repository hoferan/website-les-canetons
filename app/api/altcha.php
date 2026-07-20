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
// 100k max iterations solves in well under a second; 10-minute expiry.
echo json_encode($altcha->createChallenge(100000, 600));

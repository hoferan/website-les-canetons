<?php

use App\Altcha;

global $config;

header('Content-Type: application/json');

$altcha = new Altcha((string) ($config['altcha']['hmac_secret'] ?? ''));
// 100k max iterations solves in well under a second; 10-minute expiry.
echo json_encode($altcha->createChallenge(100000, 600));

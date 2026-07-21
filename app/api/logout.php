<?php

use App\Auth;
use App\Http\JsonResponse;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    JsonResponse::methodNotAllowed();
}

Auth::logout();
echo json_encode(['ok' => true]);

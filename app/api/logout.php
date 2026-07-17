<?php

use App\Auth;

Auth::logout();
header('Content-Type: application/json');
echo json_encode(['ok' => true]);

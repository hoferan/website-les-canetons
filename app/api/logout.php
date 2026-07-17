<?php

require __DIR__ . '/../src/bootstrap.php';
Auth::logout();
header('Content-Type: application/json');
echo json_encode(['ok' => true]);

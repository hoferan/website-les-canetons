<?php

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$username = trim((string) ($data['username'] ?? ''));
$password = (string) ($data['password'] ?? '');
if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Identifiants manquants']);
    exit;
}

$role = Auth::attemptLogin($username, $password);
if ($role === null) {
    http_response_code(401);
    // Single generic message — no username enumeration.
    echo json_encode(['error' => 'Nom d’utilisateur ou mot de passe incorrect']);
    exit;
}

echo json_encode(['role' => $role]);

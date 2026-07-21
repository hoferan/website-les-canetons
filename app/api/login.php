<?php

use App\Auth;
use App\Dto\LoginInput;
use App\Http\JsonResponse;
use App\Validation\Validator;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    JsonResponse::methodNotAllowed();
}

$data = json_decode(file_get_contents('php://input'), true) ?? [];
$username = trim((string) ($data['username'] ?? ''));
$password = (string) ($data['password'] ?? '');

$errors = Validator::validate(new LoginInput($username, $password));
if ($errors !== []) {
    JsonResponse::error(400, 'validation_failed', 'Invalid form submission', $errors);
}

$role = Auth::attemptLogin($username, $password);
if ($role === null) {
    // Single generic code — no username enumeration, and never a per-field
    // error (that would reveal which of username/password was wrong).
    JsonResponse::error(401, 'invalid_credentials', 'Incorrect username or password');
}

echo json_encode(['role' => $role]);

<?php

use App\Database;
use App\Dto\ContactInput;
use App\Http\JsonResponse;
use App\Validation\Validator;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    JsonResponse::methodNotAllowed();
}

$lastName  = trim((string) ($_POST['lastName'] ?? ''));
$firstName = trim((string) ($_POST['firstName'] ?? ''));
$email     = filter_var((string) ($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL);
$subject   = trim((string) ($_POST['subject'] ?? ''));
$message   = trim((string) ($_POST['message'] ?? ''));

$errors = Validator::validate(new ContactInput($lastName, $firstName, $email, $subject, $message));
if ($errors !== []) {
    JsonResponse::error(400, 'validation_failed', 'Invalid form submission', $errors);
}

// Store raw input; escape at output time (not at storage time).
$db = Database::get();
$stmt = $db->prepare('INSERT INTO contact_messages (last_name, first_name, email, subject, message)
     VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $lastName, $firstName, $email, $subject, $message);
$stmt->execute();
$stmt->close();
echo json_encode(['ok' => true]);

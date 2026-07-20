<?php

use App\Database;

header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

$lastName  = trim((string) ($_POST['nom'] ?? ''));
$firstName = trim((string) ($_POST['prenom'] ?? ''));
$email     = filter_var((string) ($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL);
$subject   = trim((string) ($_POST['sujet'] ?? ''));
$message   = trim((string) ($_POST['message'] ?? ''));

if (
    $lastName === '' || $firstName === '' || $subject === '' || $message === ''
    || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || mb_strlen($lastName) > 255 || mb_strlen($firstName) > 255
    || mb_strlen($email) > 255 || mb_strlen($subject) > 255
) {
    http_response_code(400);
    echo json_encode(['error' => 'Formulaire invalide']);
    exit;
}

// Store raw input; escape at output time (not at storage time).
$db = Database::get();
$stmt = $db->prepare('INSERT INTO contact_messages (last_name, first_name, email, subject, message)
     VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $lastName, $firstName, $email, $subject, $message);
$stmt->execute();
$stmt->close();
echo json_encode(['ok' => true]);

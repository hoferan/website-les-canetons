<?php

use App\Database;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Méthode non autorisée']);
    exit;
}

$nom     = trim((string) ($_POST['nom'] ?? ''));
$prenom  = trim((string) ($_POST['prenom'] ?? ''));
$email   = filter_var((string) ($_POST['email'] ?? ''), FILTER_SANITIZE_EMAIL);
$sujet   = trim((string) ($_POST['sujet'] ?? ''));
$message = trim((string) ($_POST['message'] ?? ''));

if (
    $nom === '' || $prenom === '' || $sujet === '' || $message === ''
    || !filter_var($email, FILTER_VALIDATE_EMAIL)
) {
    http_response_code(400);
    echo json_encode(['error' => 'Formulaire invalide']);
    exit;
}

// Store raw input; escape at output time (not at storage time).
$db = Database::get();
$stmt = $db->prepare('INSERT INTO contact_messages (last_name, first_name, email, subject, message)
     VALUES (?, ?, ?, ?, ?)');
$stmt->bind_param('sssss', $nom, $prenom, $email, $sujet, $message);
$stmt->execute();
$stmt->close();
echo json_encode(['ok' => true]);

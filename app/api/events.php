<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;

require __DIR__ . '/../src/bootstrap.php';
header('Content-Type: application/json');
$repo = new EventRepository(Database::get());
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents('php://input'), true) ?? [];
if ($method === 'GET') {
    // Reading events is public. Logged-in users additionally see each event
    // annotated with THEIR OWN response; anonymous visitors get null responses.
    // (No ?username= param exists, so the old IDOR stays closed.)
    if (Auth::check()) {
        echo json_encode($repo->allForUser(Auth::user()['username']));
    } else {
        echo json_encode($repo->all());
    }
    exit;
}

// All writes (create/update/delete events) require the manage_events capability (admin).
Auth::requireCanManageEvents();
if ($method === 'POST') {
    foreach (['date', 'title', 'startTime', 'endTime', 'location', 'attire'] as $k) {
        if (empty($data[$k])) {
            http_response_code(400);
            echo json_encode(['error' => "Champ manquant: {$k}"]);
            exit;
        }
    }
    $repo->create($data);
    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'PUT') {
    if (empty($data['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'id manquant']);
        exit;
    }
    $repo->update($data);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'id invalide']);
        exit;
    }
    $repo->delete($id);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Méthode non autorisée']);

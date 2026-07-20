<?php

use App\Auth;
use App\Database;
use App\Repositories\EventRepository;

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

if ($method === 'POST' || $method === 'PUT') {
    // 'attire' (Tenue) is optional — the column is nullable and the form marks it
    // as such, so it is validated separately from the required fields below.
    foreach (['date', 'title', 'startTime', 'endTime', 'location'] as $k) {
        if (!isset($data[$k]) || !is_string($data[$k]) || trim($data[$k]) === '') {
            http_response_code(400);
            echo json_encode(['error' => "Champ manquant ou invalide: {$k}"]);
            exit;
        }
    }

    // Normalize optional attire: accept an empty/missing value, reject a non-string.
    if (isset($data['attire']) && !is_string($data['attire'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Champ invalide: attire']);
        exit;
    }
    $data['attire'] = isset($data['attire']) ? trim($data['attire']) : '';

    if ($method === 'POST') {
        $repo->create($data);
        http_response_code(201);
        echo json_encode(['ok' => true]);
        exit;
    }

    // PUT also needs a valid id.
    $id = (int) ($data['id'] ?? 0);
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'id manquant ou invalide']);
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

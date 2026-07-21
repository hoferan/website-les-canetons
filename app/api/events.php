<?php

use App\Auth;
use App\Database;
use App\Dto\EventInput;
use App\Http\JsonResponse;
use App\Repositories\EventRepository;
use App\Validation\Validator;

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
    $input = new EventInput(
        $data['date'] ?? null,
        $data['title'] ?? null,
        $data['startTime'] ?? null,
        $data['endTime'] ?? null,
        $data['location'] ?? null,
        $data['attire'] ?? null,
        $data['weekend'] ?? false,
    );
    $errors = Validator::validate($input);
    if ($errors !== []) {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', $errors);
    }
    $data['attire'] = is_string($input->attire) ? trim($input->attire) : '';

    if ($method === 'POST') {
        $repo->create($data);
        http_response_code(201);
        echo json_encode(['ok' => true]);
        exit;
    }

    // PUT also needs a valid id.
    $id = (int) ($data['id'] ?? 0);
    if ($id <= 0) {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', [['field' => 'id', 'reason' => 'invalid_value']]);
    }
    $repo->update($data);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'DELETE') {
    $rawId = $_GET['id'] ?? null;
    if ($rawId === null || $rawId === '') {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', [['field' => 'id', 'reason' => 'required']]);
    }
    $id = (int) $rawId;
    if ($id <= 0) {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', [['field' => 'id', 'reason' => 'invalid_value']]);
    }
    $repo->delete($id);
    echo json_encode(['ok' => true]);
    exit;
}

JsonResponse::methodNotAllowed();

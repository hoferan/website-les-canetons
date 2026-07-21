<?php

use App\Auth;
use App\Database;
use App\Dto\ResponseInput;
use App\Http\JsonResponse;
use App\Repositories\EventRepository;
use App\Repositories\ResponseRepository;
use App\Repositories\UserRepository;
use App\Validation\Validator;

header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    // A logged-in user records THEIR OWN answer (username from session).
    // Only user/moderator may respond — admin (Team Direction) must not vote.
    Auth::requireCanRespond();
    $data = json_decode(file_get_contents('php://input'), true) ?? [];

    $errors = Validator::validate(new ResponseInput($data['eventId'] ?? null, $data['participation'] ?? null));
    if ($errors !== []) {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', $errors);
    }
    $eventId = (int) $data['eventId'];
    $participation = (string) $data['participation'];

    $eventRepo = new EventRepository(Database::get());
    if (!$eventRepo->exists($eventId)) {
        JsonResponse::error(404, 'event_not_found', 'Event not found');
    }
    $userRepo = new UserRepository(Database::get());
    $sessionUser = $userRepo->findByUsername(Auth::user()['username']);
    if ($sessionUser === null) {
        JsonResponse::error(401, 'invalid_session', 'Invalid session');
    }
    $repo->record((int) $sessionUser['id'], $eventId, $participation);
    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'GET') {
    // Admin-only summary of all users' answers for an event.
    Auth::requireCanViewSummary();
    $rawEventId = $_GET['eventId'] ?? null;
    if ($rawEventId === null || $rawEventId === '') {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', [['field' => 'eventId', 'reason' => 'required']]);
    }
    $eventId = (int) $rawEventId;
    if ($eventId <= 0) {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', [['field' => 'eventId', 'reason' => 'invalid_value']]);
    }
    // Only list users whose role may respond; non-voting roles (admin) are excluded.
    echo json_encode($repo->allForEvent($eventId, Auth::rolesWithCapability('respond')));
    exit;
}

JsonResponse::methodNotAllowed();

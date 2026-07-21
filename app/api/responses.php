<?php

use App\Auth;
use App\Database;
use App\Http\JsonResponse;
use App\Repositories\EventRepository;
use App\Repositories\ResponseRepository;
use App\Repositories\UserRepository;

header('Content-Type: application/json');
$repo = new ResponseRepository(Database::get());
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    // A logged-in user records THEIR OWN answer (username from session).
    // Only user/moderator may respond — admin (Team Direction) must not vote.
    Auth::requireCanRespond();
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $eventId = (int) ($data['eventId'] ?? 0);
    $participation = (string) ($data['participation'] ?? '');
    if ($eventId <= 0 || !in_array($participation, ['participate', 'notparticipate'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Données manquantes']);
        exit;
    }
    $eventRepo = new EventRepository(Database::get());
    if (!$eventRepo->exists($eventId)) {
        http_response_code(404);
        echo json_encode(['error' => 'Événement introuvable']);
        exit;
    }
    $userRepo = new UserRepository(Database::get());
    $sessionUser = $userRepo->findByUsername(Auth::user()['username']);
    if ($sessionUser === null) {
        http_response_code(401);
        echo json_encode(['error' => 'Session invalide']);
        exit;
    }
    $repo->record((int) $sessionUser['id'], $eventId, $participation);
    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'GET') {
    // Admin-only summary of all users' answers for an event.
    Auth::requireCanViewSummary();
    $eventId = (int) ($_GET['eventId'] ?? 0);
    if ($eventId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'eventId manquant']);
        exit;
    }
    // Only list users whose role may respond; non-voting roles (admin) are excluded.
    echo json_encode($repo->allForEvent($eventId, Auth::rolesWithCapability('respond')));
    exit;
}

JsonResponse::methodNotAllowed();

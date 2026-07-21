<?php

use App\Auth;
use App\Database;
use App\Dto\SignupInput;
use App\Http\JsonResponse;
use App\Mailer;
use App\Altcha;
use App\Repositories\ChallengeRepository;
use App\Repositories\SignupRepository;
use App\Validation\Validator;
use Shuchkin\SimpleXLSXGen;

global $config;

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$occasion = SignupRepository::ACTIVE_OCCASION;
$repo = new SignupRepository(Database::get());

if ($method === 'POST') {
    // Public: one contact registers guests. occasion is fixed server-side.
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    $firstName = trim((string) ($data['first_name'] ?? ''));
    $lastName  = trim((string) ($data['last_name'] ?? ''));
    $address   = trim((string) ($data['address'] ?? ''));
    $phone     = trim((string) ($data['phone'] ?? ''));
    $email     = trim((string) ($data['email'] ?? ''));
    $tableName = trim((string) ($data['table_name'] ?? ''));

    $honeypot = trim((string) ($data['hp'] ?? ''));
    $altchaPayload = (string) ($data['altcha'] ?? '');

    // Honeypot: a real form never fills this. Silently accept (201) without
    // storing or mailing, so a bot never learns it was trapped.
    if ($honeypot !== '') {
        http_response_code(201);
        echo json_encode(['ok' => true]);
        exit;
    }

    // Deferred until past the honeypot so a trapped bot never triggers this work.
    $menus = SignupRepository::normalizeMenus($data['menus'] ?? null);
    $errors = Validator::validate(new SignupInput($firstName, $lastName, $address, $phone, $email, $tableName));
    if ($menus === null) {
        $errors[] = ['field' => 'menus', 'reason' => 'invalid_value'];
    }
    if ($errors !== []) {
        JsonResponse::error(400, 'validation_failed', 'Invalid form submission', $errors);
    }

    // Proof-of-work gate (fail-closed) + single-use replay guard, before insert/mail.
    $altchaSecret = (string) ($config['altcha']['hmac_secret'] ?? '');
    // A server left on the placeholder/empty secret must fail closed: the default
    // secret is public (config.example.php), so any challenge it signs is forgeable.
    $signature = ($altchaSecret === '' || $altchaSecret === 'CHANGE_ME')
        ? null
        : (new Altcha($altchaSecret))->verifySolution($altchaPayload);
    $challenges = new ChallengeRepository(Database::get());
    if ($signature === null || !$challenges->consume($signature)) {
        JsonResponse::error(403, 'captcha_failed', 'Anti-bot verification failed, please try again');
    }

    $repo->create([
        'occasion'   => $occasion,
        'first_name' => $firstName,
        'last_name'  => $lastName,
        'address'    => $address,
        'phone'      => $phone,
        'email'      => $email,
        'table_name' => $tableName,
        'menus'      => $menus,
    ]);

    // Fail-safe: the reservation is already stored. A mail error must not
    // block the response — log it and still return 201.
    try {
        $mailer = new Mailer($config['mail']);
        $mailer->sendConfirmation(
            SignupRepository::OCCASIONS[$occasion],
            [
                'first_name' => $firstName,
                'last_name'  => $lastName,
                'email'      => $email,
                'table_name' => $tableName,
                'menus'      => $menus,
            ]
        );
    } catch (\Throwable $e) {
        error_log('Signup confirmation mail failed: ' . $e->getMessage());
    }

    http_response_code(201);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'GET') {
    // Admin only (Team Direction): totals + list, or xlsx export.
    Auth::requireCanViewSummary();
    $signups = $repo->allForOccasion($occasion);
    if ((string) ($_GET['format'] ?? '') === 'xlsx') {
        $rows = SignupRepository::exportRows($signups);
        SimpleXLSXGen::fromArray($rows)
            ->downloadAs('inscriptions-souper.xlsx');
        exit;
    }
    $stats = SignupRepository::computeStats($signups);
    $stats['occasion'] = SignupRepository::OCCASIONS[$occasion];
    echo json_encode($stats);
    exit;
}

JsonResponse::methodNotAllowed();

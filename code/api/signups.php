<?php

require __DIR__ . '/../src/bootstrap.php';
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
    $menus     = SignupRepository::normalizeMenus($data['menus'] ?? null);

    if (
        $firstName === '' || $lastName === '' || $address === ''
        || $phone === '' || $tableName === '' || $menus === null
        || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || mb_strlen($firstName) > 255 || mb_strlen($lastName) > 255
        || mb_strlen($address) > 255 || mb_strlen($tableName) > 255
        || mb_strlen($email) > 255 || mb_strlen($phone) > 64
    ) {
        http_response_code(400);
        echo json_encode(['error' => 'Formulaire invalide']);
        exit;
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
    // Admin only (Team Direction): totals + list, or CSV export.
    Auth::requireCanViewSummary();
    $signups = $repo->allForOccasion($occasion);
    if ((string) ($_GET['format'] ?? '') === 'csv') {
        signups_export_csv($signups);
        exit;
    }
    $stats = SignupRepository::computeStats($signups);
    $stats['occasion'] = SignupRepository::OCCASIONS[$occasion];
    echo json_encode($stats);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Méthode non autorisée']);

/**
 * Stream signups as a semicolon-separated CSV (Excel-FR friendly), one row per
 * signup with per-menu counts. Sends its own headers.
 *
 * @param array<int,array> $signups
 */
function signups_export_csv(array $signups): void
{
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="inscriptions-souper.csv"');
    $out = fopen('php://output', 'w');
    fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM so Excel shows accents
    fputcsv($out, [
        'Table', 'Nom', 'Prénom', 'Adresse', 'Téléphone',
        'Viande', 'Enfant', 'Végétarien', 'Total',
    ], ';');
    foreach ($signups as $s) {
        $counts = ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
        foreach ($s['menus'] as $m) {
            $counts[$m]++;
        }
        fputcsv($out, [
            csv_safe($s['table_name']), csv_safe($s['last_name']), csv_safe($s['first_name']),
            csv_safe($s['address']), csv_safe($s['phone']),
            $counts['meat'], $counts['child'], $counts['vegetarian'],
            count($s['menus']),
        ], ';');
    }
    fclose($out);
}

/**
 * Neutralize CSV formula injection: prefix a leading =, +, -, @ (or control
 * chars) with a quote so spreadsheet apps treat the cell as text, not a formula.
 */
function csv_safe(string $value): string
{
    if ($value !== '' && preg_match('/^[=+\-@\t\r]/', $value) === 1) {
        return "'" . $value;
    }
    return $value;
}

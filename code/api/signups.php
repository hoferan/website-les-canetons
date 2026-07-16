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
    $tableName = trim((string) ($data['table_name'] ?? ''));
    $menus     = SignupRepository::normalizeMenus($data['menus'] ?? null);

    if (
        $firstName === '' || $lastName === '' || $address === ''
        || $phone === '' || $tableName === '' || $menus === null
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
        'table_name' => $tableName,
        'menus'      => $menus,
    ]);
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
            $s['table_name'], $s['last_name'], $s['first_name'],
            $s['address'], $s['phone'],
            $counts['meat'], $counts['child'], $counts['vegetarian'],
            count($s['menus']),
        ], ';');
    }
    fclose($out);
}

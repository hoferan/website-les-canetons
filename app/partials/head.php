<?php

use App\Auth;

/** @var string|null $pageTitle */
/** @var string $pageCss */
/** @var string[] $pageScripts Optional page-specific scripts, consumed by footer.php (see there). */
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle ?? 'Les Canetons') ?></title>
    <!-- Favicons + PWA manifest. Root-absolute /assets/ paths: the front
         controller (.htaccess) serves /assets/* directly but rewrites every
         other root path to index.php, so a bare /favicon.ico would 404 — these
         explicit links are what browsers use. -->
    <link rel="icon" href="/assets/icons/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/16.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/32.png">
    <link rel="icon" type="image/png" sizes="48x48" href="/assets/icons/48.png">
    <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
    <!-- crossorigin=use-credentials: browsers fetch the manifest in no-credentials
         mode by default, so behind HTTP Basic Auth (TEST/QA) it 401s. This makes
         the manifest fetch send credentials; harmless on prod (no auth). -->
    <link rel="manifest" href="/assets/icons/manifest.json" crossorigin="use-credentials">
    <meta name="theme-color" content="#e0201a">
    <!-- Single per-page stylesheet; it @imports main.css itself. -->
    <link rel="stylesheet" href="assets/css/<?= htmlspecialchars($pageCss) ?>">
    <!-- Authenticated role from the server session — the single source of truth
         the UI reads (assets/js/session.js). null when not logged in. -->
    <script>window.__sessionRole = <?= json_encode(Auth::role()) ?>;</script>
</head>
<body>
<?php require __DIR__ . '/env_banner.php'; ?>

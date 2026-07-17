<?php

use App\Auth;

/** @var string|null $pageTitle */
/** @var string $pageCss */
require_once __DIR__ . '/../src/bootstrap.php'; // ensures Auth + session on every page, incl. public ones
?>
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle ?? 'Les Canetons') ?></title>
    <!-- Single per-page stylesheet; it @imports main.css itself. -->
    <link rel="stylesheet" href="assets/css/<?= htmlspecialchars($pageCss) ?>">
    <!-- Authenticated role from the server session — the single source of truth
         the UI reads (assets/js/session.js). null when not logged in. -->
    <script>window.__sessionRole = <?= json_encode(Auth::role()) ?>;</script>
</head>
<body>

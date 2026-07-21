<?php

use App\Auth;

Auth::requireLoginPage('admin');
if (!Auth::canManageEvents()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
<?php $pageTitle = "Page d'administration";
$pageCss = 'admin.css';
$pageScripts = ['admin.js'];
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="admin-section">
  <h1>Page d'administration</h1>
  <div class="admin-buttons">
    <form method="post" action="/planning_repet?admin=true">
      <button type="submit">Ajouter un événement</button>
    </form>
    <form method="post" action="/" onsubmit="logoutUser()">
      <button type="submit">Se déconnecter</button>
    </form>
  </div>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>

<?php

use App\Auth;

require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canManageEvents()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
<?php $pageTitle = "Page d'administration";
$pageCss = 'admin.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="admin-section">
  <h1>Page d'administration</h1>
  <div class="admin-buttons">
    <form method="post" action="planning_repet.php?admin=true">
      <button type="submit">Ajouter un événement</button>
    </form>
    <form method="post" action="index.php" onsubmit="logoutUser()">
      <button type="submit">Se déconnecter</button>
    </form>
  </div>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/admin.js"></script>
</body>
</html>

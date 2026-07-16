<?php
require 'src/bootstrap.php';
Auth::requireLoginPage('index');
if (!Auth::canViewSummary()) { http_response_code(403); exit('Accès refusé'); }
?>
<?php $pageTitle = "Résumé des inscriptions"; $pageCss = 'inscriptions_admin.css'; require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="admin-section">
  <h1>Page d'administration</h1>
  <div id="participation-summary" class="participation-summary" aria-live="polite"></div>
  <table>
    <thead>
      <tr>
        <th>Nom d'utilisateur</th>
        <th>Instrument</th>
        <th>Participation</th>
      </tr>
    </thead>
    <tbody id="users-table-body"></tbody>
  </table>
  <div style="margin-bottom: 20px;"></div><!-- Spacer -->
  <h1>Résumé des instruments</h1>
  <table class="instrument-summary">
    <thead>
      <tr>
        <th>Instrument</th>
        <th>Nombre</th>
      </tr>
    </thead>
    <tbody id="instruments-table-body"></tbody>
  </table>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/inscriptions_admin.js"></script>
</body>
</html>

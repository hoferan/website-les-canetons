<?php
require 'src/bootstrap.php';
Auth::requireLoginPage('signups_admin');
if (!Auth::canViewSummary()) {
    http_response_code(403);
    exit('Accès refusé');
}
?>
<?php $pageTitle = 'Inscriptions — Souper 25 ans';
$pageCss = 'signups_admin.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="signups-admin">
  <div class="admin-head">
    <h1 id="admin-title">Inscriptions</h1>
    <a class="csv-btn" href="api/signups.php?format=csv">⬇ Exporter en CSV</a>
  </div>
  <div class="tiles" id="tiles"></div>
  <div class="table-wrap">
    <table id="signups-table">
      <thead>
        <tr>
          <th>Table / Contact</th>
          <th>Tél.</th>
          <th class="num"><span class="dot dot-meat"></span>Viande</th>
          <th class="num"><span class="dot dot-child"></span>Enfant</th>
          <th class="num"><span class="dot dot-veg"></span>Végét.</th>
          <th class="num total">Total</th>
        </tr>
      </thead>
      <tbody id="signups-body"></tbody>
      <tfoot id="signups-foot"></tfoot>
    </table>
  </div>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/signups_admin.js"></script>
</body>
</html>

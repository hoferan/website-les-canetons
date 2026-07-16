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
  <div class="level admin-head">
    <div class="level-left">
      <h1 class="title is-4" id="admin-title">Inscriptions</h1>
    </div>
    <div class="level-right">
      <a class="button is-primary is-light" href="api/signups.php?format=csv">
        ⬇ Exporter en CSV
      </a>
    </div>
  </div>

  <div class="columns is-multiline" id="tiles"></div>

  <div class="table-container">
    <table id="signups-table" class="table is-fullwidth is-hoverable">
      <caption class="is-sr-only">Inscriptions par table et par menu</caption>
      <thead>
        <tr>
          <th scope="col">Table / Contact</th>
          <th scope="col">Tél.</th>
          <th scope="col" class="num"><span class="dot dot-meat"></span>Viande</th>
          <th scope="col" class="num"><span class="dot dot-child"></span>Enfant</th>
          <th scope="col" class="num"><span class="dot dot-veg"></span>Végét.</th>
          <th scope="col" class="num total">Total</th>
        </tr>
      </thead>
      <tbody id="signups-body" aria-live="polite"></tbody>
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

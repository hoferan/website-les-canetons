<?php

use App\Auth;

Auth::requireLoginPage('sinscrire'); ?>
<?php $pageTitle = 'Inscriptions';
$pageCss = 'sinscrire.css';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="events-section">
  <h2>Événements à venir</h2>
  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Titre</th>
          <th>Inscription</th>
        </tr>
      </thead>
      <tbody id="events-list"></tbody>
    </table>
  </div>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/vendor/i18next.min.js"></script>
<script src="assets/js/i18n.js"></script>
<script src="assets/js/sinscrire.js"></script>
</body>
</html>

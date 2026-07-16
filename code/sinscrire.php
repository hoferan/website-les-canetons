<?php require 'src/bootstrap.php'; Auth::requireLoginPage('sinscrire'); ?>
<?php $pageTitle = 'Inscriptions'; $pageCss = 'sinscrire.css'; require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

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

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/sinscrire.js"></script>
</body>
</html>

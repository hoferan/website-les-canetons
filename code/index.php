<?php $pageTitle = 'Accueil';
$pageCss = 'accueil.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<?php $home = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]; ?>

<section class="souper-cta">
  <div class="souper-card">
    <div class="souper-duck">🦆🎉</div>
    <h2><?= htmlspecialchars($home['title']) ?></h2>
    <p class="souper-subtitle"><?= htmlspecialchars($home['subtitle']) ?></p>
    <p class="souper-date"><?= htmlspecialchars($home['date_display']) ?></p>
    <?php if (Auth::canViewSummary()) : ?>
      <p>Consultez les inscriptions : totaux par menu et par table.</p>
      <a class="btn-primary" href="signups_admin.php">Voir les inscriptions</a>
    <?php else : ?>
      <p><?= htmlspecialchars($home['teaser']) ?></p>
      <p><?= htmlspecialchars($home['invitation']) ?></p>
      <a class="btn-primary" href="signup.php">S'inscrire au souper</a>
    <?php endif; ?>
  </div>
</section>

<section class="accueil">
  <h2>Bienvenue sur notre site</h2>
  <img src="assets/img/Cindyphotography-128.jpg" alt="Image d'accueil" id="imgaccueil" />
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>

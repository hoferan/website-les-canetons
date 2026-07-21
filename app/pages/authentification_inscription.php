<?php $pageTitle = 'Connexion';
$pageCss = 'authentification.css';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="page1-section">
  <h2>Authentification</h2>
  <!-- Votre formulaire de connexion -->
  <form id="login-form" method="POST">
    <label class="required" for="username">Identifiant :</label>
    <input type="text" id="username" name="username" required />
    <div id="password-container">
      <label class="required" for="password">Mot de passe :</label>
      <input type="password" id="password" name="password" required />
    </div>
    <input type="submit" value="Se connecter" />
  </form>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/vendor/i18next.min.js"></script>
<script src="assets/js/i18n.js"></script>
<script src="assets/js/authentification-inscription.js"></script>
</body>
</html>

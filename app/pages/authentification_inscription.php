<?php $pageTitle = 'Connexion';
$pageCss = 'authentification.css';
$pageScripts = ['authentification-inscription.js'];
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

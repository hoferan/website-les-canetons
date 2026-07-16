<?php $pageTitle = 'Accueil';
$pageCss = 'accueil.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="accueil">
  <h2>Bienvenue sur notre site</h2>
  <img src="assets/img/Cindyphotography-128.jpg" alt="Image d'accueil" id="imgaccueil" />
</section>

<section class="souper-cta">
  <h2>Souper — 25 ans des Canetons</h2>
  <p>Amis et familles, fêtez nos 25 ans et la sortie du nouveau costume avec nous !</p>
  <a class="btn-primary" href="signup.php">S'inscrire au souper</a>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>

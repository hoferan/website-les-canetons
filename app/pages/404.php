<?php $pageTitle = 'Page introuvable';
$pageCss = '404.css';
// No nav item matches this sentinel, so the menu shows nothing as active.
$GLOBALS['currentRoute'] = '404';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="notfound-section">
  <p class="notfound-code">404</p>
  <h2>Page introuvable</h2>
  <p class="notfound-text">
    Oups&nbsp;! La page que vous recherchez n’existe pas ou a été déplacée.
  </p>
  <a class="notfound-home" href="/">Retour à l’accueil</a>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>

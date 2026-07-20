<?php

use App\Repositories\SignupRepository;

$occasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
$pageTitle = 'Merci';
$pageCss = 'signup.css';
require __DIR__ . '/../partials/head.php';
?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="signup-section thanks">
  <div class="thanks-icon">🎉🦆</div>
  <h1>Merci pour votre inscription !</h1>
  <p class="thanks-lead">
    Votre inscription au <strong><?= htmlspecialchars($occasion['title']) ?></strong>
    a bien été enregistrée.
  </p>
  <p>
    Un e-mail de confirmation vient de vous être envoyé, avec le récapitulatif
    de votre réservation. Pensez à vérifier vos courriers indésirables si vous
    ne le trouvez pas.
  </p>
  <p class="thanks-date">Rendez-vous le <strong><?= htmlspecialchars($occasion['date_display']) ?></strong> !</p>
  <p><a class="btn-primary" href="/">Retour à l'accueil</a></p>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>

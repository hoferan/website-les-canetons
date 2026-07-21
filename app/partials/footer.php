<?php

use App\Auth;
use App\Features;
use App\Repositories\SignupRepository;

/** @var string[] $pageScripts Optional page-specific scripts (filenames under assets/js/), set by the page before this include. */
?>
<footer>
  <p class="footer-copyright">&copy; 2026 Guggenmusik les canetons de Fribourg Tous droits réservés.</p>
</footer>

<?php // The signup popup targets guests; admins (Team Direction) never see it. ?>
<?php if (Features::enabled('souper_signup') && !Auth::canViewSummary()) : ?>
    <?php $popupOccasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION]; ?>
<div
  id="supper-popup"
  class="popup-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="<?= htmlspecialchars($popupOccasion['title']) ?>"
>
  <div class="popup-box">
    <button type="button" class="popup-close" aria-label="Fermer">✕</button>
    <div class="popup-banner">
      <div class="popup-duck">🦆🎉</div>
      <h3><?= htmlspecialchars($popupOccasion['title']) ?></h3>
      <p class="popup-subtitle"><?= htmlspecialchars($popupOccasion['subtitle']) ?></p>
      <p class="popup-date"><?= htmlspecialchars($popupOccasion['date_display']) ?></p>
    </div>
    <div class="popup-body">
      <p><?= htmlspecialchars($popupOccasion['teaser']) ?></p>
      <p><?= htmlspecialchars($popupOccasion['invitation']) ?></p>
      <a class="popup-cta" href="/signup">S'inscrire au souper</a>
      <button type="button" class="popup-dismiss">Non merci, ne plus afficher</button>
    </div>
  </div>
</div>
<script src="assets/js/supper-popup.js"></script>
<?php endif; ?>

<?php // Scripts shared by every page, then any page-specific scripts (in load order). ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/vendor/i18next.min.js"></script>
<script src="assets/js/i18n.js"></script>
<?php foreach ($pageScripts ?? [] as $script) : ?>
<script src="assets/js/<?= htmlspecialchars($script) ?>"></script>
<?php endforeach; ?>
</body>
</html>

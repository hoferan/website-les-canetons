<?php

use App\Auth;
use App\Repositories\SignupRepository;

?>
<footer>
  <p class="footer-copyright">&copy; 2026 Guggenmusik les canetons de Fribourg Tous droits réservés.</p>
</footer>

<?php // The signup popup targets guests; admins (Team Direction) never see it. ?>
<?php if (!Auth::canViewSummary()) : ?>
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

<footer>
  <p1>&copy; 2023 Guggenmusik les canetons de Fribourg Tous droits réservés.</p1>
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
      <p><?= htmlspecialchars($popupOccasion['subtitle']) ?></p>
      <p class="popup-date"><?= htmlspecialchars($popupOccasion['date_display']) ?></p>
    </div>
    <div class="popup-body">
      <p><?= htmlspecialchars($popupOccasion['teaser']) ?></p>
      <a class="btn-primary popup-cta" href="signup.php">S'inscrire au souper</a>
      <button type="button" class="popup-dismiss">Non merci, ne plus afficher</button>
    </div>
  </div>
</div>
<script src="assets/js/supper-popup.js"></script>
<?php endif; ?>

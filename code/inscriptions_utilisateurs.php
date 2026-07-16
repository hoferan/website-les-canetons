<?php require 'src/bootstrap.php'; Auth::requireLoginPage('sinscrire'); ?>
<?php $pageTitle = "Inscription à l'événement"; $pageCss = 'authentification.css'; require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="page1-section">
  <h1>Inscription à l'événement</h1>
  <form id="event-registration-form" method="POST">
    <!-- Ajoutez une zone de texte pour l'identifiant de l'utilisateur -->
    <div>
      <label for="user-username">Identifiant de l'utilisateur :</label>
      <input type="text" id="user-username" name="user-username" readonly disabled value="<?= htmlspecialchars(Auth::user()['username']) ?>" />
    </div>
    <div>
      <label for="participant-participation">Participation :</label>
      <select id="participant-participation" name="participant-participation" required>
        <option value="" disabled selected>Choisissez une option</option>
        <option value="participate">Je participe</option>
        <option value="notparticipate">Je ne participe pas</option>
      </select>
    </div>
    <div>
      <input type="hidden" name="event-id" id="event-id" value="" />
      <button type="submit">Confirmer</button>
    </div>
  </form>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/inscriptions_utilisateurs.js"></script>
</body>
</html>

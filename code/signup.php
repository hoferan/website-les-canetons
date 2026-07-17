<?php require 'src/bootstrap.php'; ?>
<?php
$occasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
$repo = new SignupRepository(Database::get());
$tables = $repo->distinctTables(SignupRepository::ACTIVE_OCCASION);
$pageTitle = $occasion['title'];
$pageCss = 'signup.css';
require 'partials/head.php';
?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="signup-section">
  <h1 class="signup-title"><?= htmlspecialchars($occasion['title']) ?></h1>
  <p class="signup-subtitle"><?= htmlspecialchars($occasion['subtitle']) ?></p>
  <p class="signup-desc"><?= htmlspecialchars($occasion['description']) ?></p>

  <form id="signup-form">
    <fieldset>
      <legend>Vos coordonnées</legend>
      <div class="form-grid">
        <div class="form-group">
          <label for="first_name" class="required">Prénom</label>
          <input type="text" id="first_name" name="first_name" required />
        </div>
        <div class="form-group">
          <label for="last_name" class="required">Nom</label>
          <input type="text" id="last_name" name="last_name" required />
        </div>
        <div class="form-group">
          <label for="address" class="required">Adresse</label>
          <input type="text" id="address" name="address" required />
        </div>
        <div class="form-group">
          <label for="phone" class="required">Téléphone</label>
          <input type="tel" id="phone" name="phone" required />
        </div>
        <div class="form-group">
          <label for="email" class="required">E-mail</label>
          <input type="email" id="email" name="email" required />
        </div>
      </div>
      <div class="form-group">
        <label for="table_name" class="required">Table (nom de famille ou nom de table)</label>
        <input type="text" id="table_name" name="table_name" list="tables" required />
        <datalist id="tables">
          <?php foreach ($tables as $t) : ?>
            <option value="<?= htmlspecialchars($t) ?>"></option>
          <?php endforeach; ?>
        </datalist>
        <small class="hint">
          Commencez à taper : les tables déjà créées vous seront proposées.
          Choisissez la même table pour être placés ensemble.
        </small>
      </div>
    </fieldset>

    <fieldset>
      <legend>Convives &amp; menus</legend>
      <div id="guests"></div>
      <button type="button" id="add-guest" class="add-guest">＋ Ajouter une personne</button>
      <p class="tally" id="tally"></p>
    </fieldset>

    <div class="form-actions">
      <button type="submit" class="btn-primary">Envoyer l'inscription</button>
    </div>
  </form>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/signup.js"></script>
</body>
</html>

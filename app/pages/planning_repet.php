<?php

use App\Auth;

$pageTitle = 'Planning et répétitions';
$pageCss = 'planning_repet.css';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="planning-repet-section">
  <h2>Planning des prestations et des répétitions</h2>
  <h3>sous réserve de modifications</h3>
  <h4>Saison 2023-2024</h4>
  <ul id="events-list"></ul>

  <?php if (Auth::canManageEvents()) : ?>
  <!-- Interface de l'administrateur (rendue uniquement côté serveur pour les admins) -->
  <div id="admin-interface">
    <form id="event-form">
      <input type="number" id="event-id" name="event-id" hidden/>
      <label class="required" for="event-date">Date :</label>
      <input type="date" id="event-date" name="event-date" required /><br />
      <label class="required" for="event-title">Titre :</label>
      <input type="text" id="event-title" name="event-title" required /><br />
      <label class="required" for="event-time-start">Heure de début :</label>
      <input type="time" id="event-time-start" name="event-time-start" required /><br />
      <label class="required" for="event-time-end">Heure de fin :</label>
      <input type="time" id="event-time-end" name="event-time-end" required /><br />
      <label class="required" for="event-location">Lieu :</label>
      <input type="text" id="event-location" name="event-location" required />
      <label for="event-attire">Tenue :</label>
      <input type="text" id="event-attire" name="event-attire" /><br />
      <label for="event-weekend">
        <span style="float: left">Weekend</span>
        <input type="checkbox" id="event-weekend" name="event-weekend" />
      </label><br />
      <input type="submit" value="Ajouter" />
      <p id="event-error" class="form-error" role="alert" style="display: none"></p>
    </form>
  </div>
  <?php endif; ?>

  <!-- Résultat de l'ajout d'événement pour l'administrateur -->
  <div id="event-result" style="display: none">
    <h3>Événement ajouté :</h3>
    <div id="result-info">
      <p><strong>Date :</strong> <span id="result-date"></span></p>
      <p><strong>Titre :</strong> <span id="result-title"></span></p>
      <p><strong>Heure de début :</strong> <span id="result-time-start"></span></p>
      <p><strong>Heure de fin :</strong> <span id="result-time-end"></span></p>
      <p><strong>Lieu :</strong> <span id="result-location"></span></p>
      <p id="result-attire-label"><strong>Tenue :</strong> <span id="result-attire"></span></p>
      <p id="result-dates-label"><strong>Dates :</strong> <span id="result-dates"></span></p>
    </div>
  </div>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script src="assets/js/planning_repet.js"></script>
</body>
</html>

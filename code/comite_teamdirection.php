<?php $pageTitle = 'Comité et team direction';
$pageCss = 'comite_teamdirection.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="personne-section">
  <h2>Le comité</h2>
  <div class="committee-photo">
    <img src="assets/img/comite.jpg" alt="Le comité" />
  </div>

  <div class="contact-block">
    <h3>Contact des Canetons</h3>
    <p><a href="mailto:comite@lescanetons.org">comite@lescanetons.org</a></p>
  </div>

  <div class="committee-grid">
    <article class="member-card">
      <p class="member-role">Présidente</p>
      <p class="member-name">Delphine Maillard</p>
    </article>

    <article class="member-card">
      <p class="member-role">Vice-présidente - secrétaire</p>
      <p class="member-name">Amanda Portmann</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable prestations</p>
      <p class="member-name">Céline Cuennet</p>
      <p class="member-phone"><a href="tel:+41793221257">079 322 12 57</a></p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable caisse</p>
      <p class="member-name">Marc Rossier</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable intendance</p>
      <p class="member-name">Tiago Garces Cardoso</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable costumes</p>
      <p class="member-name">Martine Jutzet</p>
    </article>

    <article class="member-card">
      <p class="member-role">Responsable Team Direction</p>
      <p class="member-name">Laura Mantel</p>
    </article>

    <article class="member-card">
      <p class="member-role">Membre</p>
      <p class="member-name">Patrice Bersier</p>
    </article>
  </div>

  <h2>Direction musicale</h2>
  <div class="musical-directors">
    <img src="assets/img/directionmusicale.jpg" alt="La Direction musicale" />
    <p>Laura Mantel et Delphine Maillard</p>
  </div>

  <h2>Le parrain et la marraine</h2>
  <div class="sponsors">
    <img src="assets/img/parrainmarraine.jpg" alt="Le parrain et la marraine" />
    <p>Richard Hertig et Annick Bürgisser</p>
  </div>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>

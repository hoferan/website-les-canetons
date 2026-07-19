<?php $pageTitle = 'Commencer les Canetons';
$pageCss = 'commencement.css';
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="supervision-section">
  <div class="texte">
    <h2>Tu veux commencer la guggen?</h2>
    <p>
      Nous sommes constamment à la recherche de quelques souffleurs pour
      s'époumonner et faire "concurrence" à nos percussions!
    </p>
  </div>
  <div class="supervision-container">
    <div class="instruments-info">
      <h2>Instruments recherchés</h2>
      <p>Trompette</p>
      <p>Trombone</p>
      <p>Sousaphone</p>
      <p>Euphonium</p>
    </div>
    <div class="hours-info">
      <h2>Horaires</h2>
      <p>Les samedis matin</p>
      <p>De 10h à 12h</p>
    </div>
    <div class="location-info">
      <h2>Lieu</h2>
      <p>
        <a
          href="https://www.google.com/maps/dir/46.8067938,7.1370156/Association+Werkhof+Fribourg,+Planche-Inférieure+14,+1700+Fribourg/@46.8124723,7.1349983,14z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x478e69237f5723e3:0x97fe5bd05ee01349!2m2!1d7.1656142!2d46.8025755?hl=fr&entry=ttu"
          target="_blank"
          >Werkhof</a
        >
      </p>
      <p>Basse-Ville de Fribourg</p>
    </div>

    <div class="contact-age">
      <h2>Critères d'âge</h2>
      <p>Dès 7ans dans l'année civile jusqu'a l'âge de 18ans</p>
    </div>

    <div class="contact-info">
      <h2>Contacts</h2>
      <p>Delphine Maillard</p>
      <p><a href="tel:0754177191">075 417 71 91</a></p>
      <p>Laura Mantel</p>
      <p><a href="tel:0792807767">079 280 77 67</a></p>
    </div>
  </div>
  <div class="flyer-container">
    <img src="assets/img/Flyer.jpeg" alt="Image" class="flyer" />
    <div class="button-container">
      <a href="assets/img/Flyer.jpeg" download>
        <button class="download-button">Télécharger</button>
      </a>
    </div>
  </div>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
</body>
</html>

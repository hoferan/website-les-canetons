<?php $pageTitle = 'Contact';
$pageCss = 'contact.css';
require 'partials/head.php'; ?>
<?php require 'partials/banner.php'; ?>
<?php require 'partials/navigation.php'; ?>

<section class="contact-section">
  <h2>Contact</h2>
  <form id="contact-form" action="api/contact.php" method="POST">
    <div class="form-group">
      <label for="nom">Nom:</label>
      <input type="text" id="nom" name="nom" required />
    </div>
    <div class="form-group">
      <label for="prenom">Prénom:</label>
      <input type="text" id="prenom" name="prenom" required />
    </div>
    <div class="form-group">
      <label for="email">E-mail:</label>
      <input type="email" id="email" name="email" required />
    </div>
    <div class="form-group">
      <label for="sujet">Sujet:</label>
      <input type="text" id="sujet" name="sujet" />
    </div>
    <div class="form-group">
      <label for="message">Contenu du message:</label>
      <textarea id="message" name="message" required></textarea>
    </div>
    <button type="submit">Envoyer</button>
  </form>
</section>

<?php require 'partials/footer.php'; ?>
<script src="assets/js/session.js"></script>
<script src="assets/js/main.js"></script>
<script>
  // The contact endpoint returns JSON; submit via fetch and redirect to the
  // confirmation page on success (buildless: a small inline handler).
  document.getElementById("contact-form").addEventListener("submit", function (e) {
    e.preventDefault();
    fetch("api/contact.php", { method: "POST", body: new FormData(this) })
      .then(function (r) {
        if (!r.ok) throw new Error("contact-failed");
        window.location.href = "confirmation.php";
      })
      .catch(function () {
        alert("Échec de l’envoi du formulaire. Veuillez réessayer.");
      });
  });
</script>
</body>
</html>

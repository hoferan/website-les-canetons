<?php $pageTitle = 'Contact';
$pageCss = 'contact.css';
$pageScripts = ['contact.js'];
require __DIR__ . '/../partials/head.php'; ?>
<?php require __DIR__ . '/../partials/banner.php'; ?>
<?php require __DIR__ . '/../partials/navigation.php'; ?>

<section class="contact-section">
  <h2>Contact</h2>
  <form id="contact-form" action="/api/contact" method="POST">
    <div class="form-group">
      <label for="lastName">Nom:</label>
      <input type="text" id="lastName" name="lastName" required />
    </div>
    <div class="form-group">
      <label for="firstName">Prénom:</label>
      <input type="text" id="firstName" name="firstName" required />
    </div>
    <div class="form-group">
      <label for="email">E-mail:</label>
      <input type="email" id="email" name="email" required />
    </div>
    <div class="form-group">
      <label for="subject">Sujet:</label>
      <input type="text" id="subject" name="subject" />
    </div>
    <div class="form-group">
      <label for="message">Contenu du message:</label>
      <textarea id="message" name="message" required></textarea>
    </div>
    <button type="submit">Envoyer</button>
  </form>
</section>

<?php require __DIR__ . '/../partials/footer.php'; ?>

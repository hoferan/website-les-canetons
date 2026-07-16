<?php
$current = basename($_SERVER['SCRIPT_NAME']);
// The two inscription sub-pages highlight the "Inscriptions" (sinscrire) item,
// matching the old setActiveNavigation() behavior.
if ($current === 'inscriptions_admin.php' || $current === 'inscriptions_utilisateurs.php') {
    $current = 'sinscrire.php';
}
$active = fn(string $page): string => $current === $page ? 'active' : '';
?>
<nav class="nav">
  <button
    type="button"
    class="nav-toggle"
    aria-label="Menu de navigation"
    aria-expanded="false"
    aria-controls="nav-menu"
  >
    ☰
  </button>
  <ul id="nav-menu">
    <li class="<?= $active('index.php') ?>"><a href="index.php">Accueil</a></li>
    <li class="<?= $active('commencement.php') ?>"><a href="commencement.php">Commencer les Canetons</a></li>
    <li class="<?= $active('comite_teamdirection.php') ?>"><a href="comite_teamdirection.php">Contact Canetons</a></li>
    <li class="<?= $active('canetons.php') ?>"><a href="canetons.php">Les canetons</a></li>
    <li class="<?= $active('moniteurs.php') ?>"><a href="moniteurs.php">Moniteurs</a></li>
    <li class="<?= $active('planning_repet.php') ?>"><a href="planning_repet.php">Planning et répétitions</a></li>
    <li class="<?= $active('sinscrire.php') ?>"><a href="sinscrire.php">Inscriptions</a></li>
    <li class="<?= $active('cd.php') ?>"><a href="cd.php">CD</a></li>
    <li class="<?= $active('sponsors.php') ?>"><a href="sponsors.php">Sponsors et liens amis</a></li>
    <li class="<?= $active('historique.php') ?>"><a href="historique.php">Historique</a></li>
    <li><a href="https://www.flickr.com/photos/201962767@N02/collections" id="galerie-link" target="_blank">Galerie ↗</a></li>
    <li class="<?= $active('multimedia.php') ?>"><a href="multimedia.php">Multimédia</a></li>
    <li class="nav-auth"><a href="#" id="nav-auth-link">Connexion</a></li>
  </ul>
</nav>
</header>

<?php

$current = $GLOBALS['currentRoute'] ?? '';
// The two inscription sub-pages highlight the "Inscriptions" (sinscrire) item,
// matching the old setActiveNavigation() behavior.
if ($current === 'inscriptions_admin' || $current === 'inscriptions_utilisateurs') {
    $current = 'sinscrire';
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
    <i data-lucide="menu" class="icon-md"></i>
  </button>
  <ul id="nav-menu">
    <li class="<?= $active('') ?>"><a href="/">Accueil</a></li>
    <li class="<?= $active('commencement') ?>"><a href="/commencement">Commencer les Canetons</a></li>
    <li class="<?= $active('comite_teamdirection') ?>"><a href="/comite_teamdirection">Contact Canetons</a></li>
    <li class="<?= $active('canetons') ?>"><a href="/canetons">Les canetons</a></li>
    <li class="<?= $active('moniteurs') ?>"><a href="/moniteurs">Moniteurs</a></li>
    <li class="<?= $active('planning_repet') ?>"><a href="/planning_repet">Planning et répétitions</a></li>
    <li class="<?= $active('sinscrire') ?>"><a href="/sinscrire">Inscriptions</a></li>
    <li class="<?= $active('cd') ?>"><a href="/cd">CD</a></li>
    <li class="<?= $active('sponsors') ?>"><a href="/sponsors">Sponsors et liens amis</a></li>
    <li class="<?= $active('historique') ?>"><a href="/historique">Historique</a></li>
    <li><a
      href="https://www.flickr.com/photos/201962767@N02/collections"
      id="galerie-link"
      target="_blank"
    >Galerie <i data-lucide="external-link" class="icon-sm"></i></a></li>
    <li class="<?= $active('multimedia') ?>"><a href="/multimedia">Multimédia</a></li>
    <li class="nav-auth"><a href="#" id="nav-auth-link">Connexion</a></li>
  </ul>
</nav>
</header>

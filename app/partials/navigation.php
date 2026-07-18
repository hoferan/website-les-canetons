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
    <svg
      class="icon"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </svg>
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
    >Galerie
      <svg
        class="icon icon-inline"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      </svg>
    </a></li>
    <li class="<?= $active('multimedia') ?>"><a href="/multimedia">Multimédia</a></li>
    <li class="nav-auth"><a href="#" id="nav-auth-link">Connexion</a></li>
  </ul>
</nav>
</header>

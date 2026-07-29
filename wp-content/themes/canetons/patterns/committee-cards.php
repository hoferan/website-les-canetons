<?php
/**
 * Title: Comité et Team Direction
 * Slug: canetons/committee-cards
 * Categories: canetons
 * Description: Les trois sections de la page Comité — photo de groupe puis liste des fonctions.
 *
 * Shape taken from the live site (lescanetons.org/comite_teamdirection): three
 * sections, each a heading, ONE GROUP PHOTO, and a text list of function and
 * name. It is not a grid of one card per person, which is what this pattern used
 * to be — a shape the site has never had.
 *
 * The slug still says `cards` because the scaffolded pages reference it by that
 * slug in their stored content; renaming it would silently empty those pages.
 *
 * The function labels are real, because the committee's roles are structure and
 * change rarely. The names are placeholders: people are content.
 */

?>
<!-- wp:group {"align":"wide","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignwide">
	<!-- wp:heading -->
	<h2 class="wp-block-heading">Comité — Team Direction</h2>
	<!-- /wp:heading -->

	<!-- wp:paragraph -->
	<p>TODO — décider si une adresse de contact figure ici. L’ancien site publiait une adresse e-mail et un numéro de téléphone en clair ; le formulaire de contact permet de joindre le comité sans exposer personne.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Le comité</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo du comité"/></figure>
	<!-- /wp:image -->

	<!-- wp:list -->
	<ul class="wp-block-list">
		<!-- wp:list-item --><li>Présidence : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Vice-présidence et secrétariat : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Responsable prestations : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Responsable caisse : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Responsable intendance : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Responsable costumes : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Responsable Team Direction : Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Membre : Prénom Nom</li><!-- /wp:list-item -->
	</ul>
	<!-- /wp:list -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Direction musicale</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la direction musicale"/></figure>
	<!-- /wp:image -->

	<!-- wp:list -->
	<ul class="wp-block-list">
		<!-- wp:list-item --><li>Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Prénom Nom</li><!-- /wp:list-item -->
	</ul>
	<!-- /wp:list -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Le parrain et la marraine</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo du parrain et de la marraine"/></figure>
	<!-- /wp:image -->

	<!-- wp:list -->
	<ul class="wp-block-list">
		<!-- wp:list-item --><li>Prénom Nom</li><!-- /wp:list-item -->
		<!-- wp:list-item --><li>Prénom Nom</li><!-- /wp:list-item -->
	</ul>
	<!-- /wp:list -->
</div>
<!-- /wp:group -->

<?php
/**
 * Title: Sponsors et liens amis
 * Slug: canetons/sponsor-links
 * Categories: canetons
 * Description: Les trois listes de liens de la page Sponsors — carnavals, guggens et amis.
 *
 * Shape taken from the live site (lescanetons.org/sponsors): this page is three
 * CATEGORISED LISTS OF TEXT LINKS, not a grid of logos. It replaces an earlier
 * `canetons/sponsor-grid` pattern that assumed logo cards — a shape the site has
 * never had, and which would have led whoever authors this page to rebuild it
 * wrongly.
 *
 * Only the three category headings are real, because they are structure. The
 * entries are placeholders: sponsor names and URLs are CONTENT and belong in the
 * page, since a sponsor changing must never require a theme deploy.
 *
 * French, like every pattern here. The German twin at /de/sponsoren/ starts from
 * this same pattern and its text is then translated by hand — that is what the
 * two-tree bilingual design asks for.
 */

?>
<!-- wp:group {"align":"wide","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignwide">
	<!-- wp:heading -->
	<h2 class="wp-block-heading">Sponsors et liens amis</h2>
	<!-- /wp:heading -->

	<!-- wp:paragraph -->
	<p>Merci à celles et ceux qui nous soutiennent.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Les Carnavals</h3>
	<!-- /wp:heading -->

	<!-- wp:list -->
	<ul class="wp-block-list">
		<!-- wp:list-item --><li><a href="#">Nom du carnaval — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom du carnaval — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom du carnaval — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom du carnaval — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom du carnaval — Lieu</a></li><!-- /wp:list-item -->
	</ul>
	<!-- /wp:list -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Les Guggens</h3>
	<!-- /wp:heading -->

	<!-- wp:list -->
	<ul class="wp-block-list">
		<!-- wp:list-item --><li><a href="#">Nom de la guggen — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom de la guggen — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom de la guggen — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom de la guggen — Lieu</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom de la guggen — Lieu</a></li><!-- /wp:list-item -->
	</ul>
	<!-- /wp:list -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Les Amis</h3>
	<!-- /wp:heading -->

	<!-- wp:list -->
	<ul class="wp-block-list">
		<!-- wp:list-item --><li><a href="#">Nom — Activité</a></li><!-- /wp:list-item -->
		<!-- wp:list-item --><li><a href="#">Nom — Activité</a></li><!-- /wp:list-item -->
	</ul>
	<!-- /wp:list -->
</div>
<!-- /wp:group -->

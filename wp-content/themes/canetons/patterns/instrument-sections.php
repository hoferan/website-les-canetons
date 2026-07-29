<?php
/**
 * Title: Nos sections
 * Slug: canetons/instrument-sections
 * Categories: canetons
 * Description: Les sections de la page Les Canetons — pour chacune, une photo puis les prénoms.
 *
 * Shape taken from the live site (lescanetons.org/canetons): a vertical run of
 * sections, each a heading, a SECTION PHOTO, and a line of member names with
 * their positions in the photo. It is not a grid of one card per instrument,
 * which is what this pattern used to be.
 *
 * Headings follow the live site, so they are plural and carry the possessive —
 * "Nos Trompettes", not "Trompette". They are page copy, and deliberately NOT the
 * same strings as the plugin's instrument labels: those are the taxonomy behind
 * the attendance summary (Instruments::DEFAULTS, singular) and are matched
 * against the old database during migration. Changing a heading here must never
 * be mistaken for changing a section slug there.
 *
 * Two sections of that taxonomy have no block below, matching the live site:
 * Sousaphone, which currently has no players, and Maquillage, whose members are
 * not a musical section. Add them if that changes.
 */

?>
<!-- wp:group {"align":"wide","layout":{"type":"constrained"}} -->
<div class="wp-block-group alignwide">
	<!-- wp:heading -->
	<h2 class="wp-block-heading">Nos Canetons</h2>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de groupe des Canetons"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — présenter la clique en quelques lignes.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">La Direction Musicale</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la direction musicale"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>Prénom et Prénom</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Nos Batteurs</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la section batterie"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — prénoms, de gauche à droite.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Nos Grosses-Caisses</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la section grosses-caisses"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — prénoms, de gauche à droite.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Notre Lyre</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la lyre"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — prénom.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Nos Cloches</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la section cloches"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — prénoms, de gauche à droite.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Nos Trompettes</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la section trompettes"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — prénoms, rangée debout puis rangée avant.</p>
	<!-- /wp:paragraph -->

	<!-- wp:heading {"level":3} -->
	<h3 class="wp-block-heading">Nos Trombones</h3>
	<!-- /wp:heading -->

	<!-- wp:image {"sizeSlug":"large"} -->
	<figure class="wp-block-image size-large"><img alt="Photo de la section trombones"/></figure>
	<!-- /wp:image -->

	<!-- wp:paragraph -->
	<p>TODO — prénoms, de gauche à droite.</p>
	<!-- /wp:paragraph -->
</div>
<!-- /wp:group -->

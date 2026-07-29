<?php
/**
 * Theme setup for the canetons child theme (spec §5).
 *
 * Deliberately thin: the design system is theme.json, and page layouts are
 * block patterns in patterns/ (auto-registered by WordPress for block themes).
 * This file only enqueues the single stylesheet, registers the pattern
 * category, and registers the one custom block style the patterns use.
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueue the child theme's single stylesheet. A block theme does not load
 * style.css automatically, so it is enqueued here; the design tokens it uses
 * come from theme.json, so this stays small.
 */
add_action(
	'wp_enqueue_scripts',
	static function (): void {
		wp_enqueue_style(
			'canetons-style',
			get_stylesheet_uri(),
			array(),
			wp_get_theme()->get( 'Version' )
		);
	}
);

/**
 * The pattern category the theme's patterns belong to, and the "card" block
 * style they use for the committee, sponsor and section cards.
 */
add_action(
	'init',
	static function (): void {
		register_block_pattern_category(
			'canetons',
			array( 'label' => 'Les Canetons' )
		);

		register_block_style(
			'core/group',
			array(
				'name'  => 'canetons-card',
				'label' => 'Carte',
			)
		);
	}
);

/**
 * Bilingual public content (fr-CH + de-CH) via two manual page trees, /fr/* and
 * /de/*, with NO multilingual plugin (see the bilingual-public-content design).
 *
 * The pages themselves are authored bilingually; the code stays French — the
 * members' area and the canetons-planning plugin are French-only, so nothing
 * here internationalises plugin strings. These helpers only: set the correct
 * <html lang> per tree, provide a language switcher, and optionally send the
 * bare site root to the default language.
 *
 * `fr_CH` is not an official WordPress locale, so the SITE locale stays `fr_FR`;
 * the `lang` attribute below is a free BCP-47 tag and is not tied to it.
 */

/**
 * The language trees: top-level page slug => BCP-47 tag for <html lang>.
 * Filterable so the slugs or tags can change without editing the theme.
 *
 * @return array<string, string>
 */
function canetons_languages(): array {
	return (array) apply_filters(
		'canetons_languages',
		array(
			'fr' => 'fr-CH',
			'de' => 'de-CH',
		)
	);
}

/** The default language slug — used at the root and as a fallback. */
function canetons_default_language(): string {
	$slugs = array_keys( canetons_languages() );
	return $slugs[0] ?? 'fr';
}

/**
 * The language of the current request: the slug of the queried page's top-level
 * ancestor when that is a language tree, else the first URL segment, else the
 * default.
 */
function canetons_current_language(): string {
	$languages = canetons_languages();

	$queried = get_queried_object();
	if ( $queried instanceof WP_Post ) {
		$ancestors = get_post_ancestors( $queried );
		$top_id    = empty( $ancestors ) ? $queried->ID : (int) end( $ancestors );
		$top       = get_post( $top_id );
		if ( $top instanceof WP_Post && isset( $languages[ $top->post_name ] ) ) {
			return $top->post_name;
		}
	}

	$path    = trim( (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ), '/' );
	$segment = strtok( $path, '/' );
	if ( false !== $segment && isset( $languages[ $segment ] ) ) {
		return $segment;
	}

	return canetons_default_language();
}

/** Emit the correct <html lang="..."> for the current tree (accessibility + SEO). */
add_filter(
	'language_attributes',
	static function ( string $output ): string {
		$languages = canetons_languages();
		$tag       = $languages[ canetons_current_language() ] ?? (string) reset( $languages );

		$count    = 0;
		$replaced = preg_replace( '/lang="[^"]*"/', 'lang="' . esc_attr( $tag ) . '"', $output, 1, $count );
		if ( $count > 0 && null !== $replaced ) {
			return $replaced;
		}
		return trim( $output . ' lang="' . esc_attr( $tag ) . '"' );
	}
);

/**
 * A language switcher, available as `[canetons_language_switcher]` and as a
 * template tag. Each other language links to its tree's landing page; a page may
 * override its counterpart URL with the `_canetons_lang_alt` post meta (useful
 * for the two-tree case, where there is exactly one other language).
 */
function canetons_language_switcher(): string {
	$languages = canetons_languages();
	$current   = canetons_current_language();
	$queried   = get_queried_object();
	$override   = $queried instanceof WP_Post
		? (string) get_post_meta( $queried->ID, '_canetons_lang_alt', true )
		: '';

	$links = array();
	foreach ( $languages as $slug => $tag ) {
		$label = strtoupper( $slug );

		if ( $slug === $current ) {
			$links[] = '<span class="canetons-lang is-current" aria-current="true">' . esc_html( $label ) . '</span>';
			continue;
		}

		$landing = get_page_by_path( $slug );
		$url     = '' !== $override
			? $override
			: ( $landing ? (string) get_permalink( $landing ) : home_url( '/' . $slug . '/' ) );

		$links[] = '<a class="canetons-lang" hreflang="' . esc_attr( $tag ) . '" href="' . esc_url( $url ) . '">' . esc_html( $label ) . '</a>';
	}

	return '<nav class="canetons-lang-switcher" aria-label="Langue">' . implode( ' ', $links ) . '</nav>';
}

add_shortcode( 'canetons_language_switcher', static fn (): string => canetons_language_switcher() );

/**
 * Optional: send the bare site root to the default language tree, so both
 * languages live symmetrically under /fr/ and /de/. Return '' from the
 * `canetons_root_redirect` filter to disable, or a different URL to retarget.
 */
add_action(
	'template_redirect',
	static function (): void {
		if ( is_admin() || ! is_front_page() ) {
			return;
		}

		$target = (string) apply_filters(
			'canetons_root_redirect',
			home_url( '/' . canetons_default_language() . '/' )
		);

		if ( '' !== $target && untrailingslashit( $target ) !== untrailingslashit( home_url( '/' ) ) ) {
			wp_safe_redirect( $target, 302 );
			exit;
		}
	}
);

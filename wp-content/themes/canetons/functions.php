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
 * The language tree one specific post sits in, or '' when it sits in neither.
 *
 * Strict on purpose, unlike {@see canetons_current_language()}: it does NOT fall
 * back to the default language. A page outside both trees — the Privacy Policy
 * draft, say — has no counterpart, and must not be advertised as a translation of
 * one.
 */
function canetons_post_tree_language( WP_Post $post ): string {
	$languages = canetons_languages();

	$ancestors = get_post_ancestors( $post );
	$top_id    = empty( $ancestors ) ? $post->ID : (int) end( $ancestors );
	$top       = get_post( $top_id );

	return ( $top instanceof WP_Post && isset( $languages[ $top->post_name ] ) )
		? $top->post_name
		: '';
}

/**
 * The language of the current request: the slug of the queried page's top-level
 * ancestor when that is a language tree, else the first URL segment, else the
 * default.
 */
function canetons_current_language(): string {
	$queried = get_queried_object();
	if ( $queried instanceof WP_Post ) {
		$tree = canetons_post_tree_language( $queried );
		if ( '' !== $tree ) {
			return $tree;
		}
	}

	$languages = canetons_languages();
	$path      = trim( (string) wp_parse_url( $_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH ), '/' );
	$segment   = strtok( $path, '/' );
	if ( false !== $segment && isset( $languages[ $segment ] ) ) {
		return $segment;
	}

	return canetons_default_language();
}

/**
 * Advertise the two trees as translations of one another, with hreflang.
 *
 * The bilingual design shipped without these and listed them as a possible later
 * addition; the data has since arrived, because every scaffolded page carries its
 * counterpart's URL in `_canetons_lang_alt`. Emitting them needs no plugin and
 * introduces no second source of truth. Without them the two trees look to a
 * search engine like unrelated pages that happen to duplicate each other.
 *
 * The set is self-referential — each page advertises itself as well as its
 * counterpart — which is what search engines expect; a set that omits the current
 * page is ignored. `x-default` points at the default tree, matching the root
 * redirect. Using the single `_canetons_lang_alt` value for "the other language"
 * assumes exactly two trees, which the design states outright.
 */
add_action(
	'wp_head',
	static function (): void {
		if ( ! is_singular() ) {
			return;
		}

		$queried = get_queried_object();
		if ( ! $queried instanceof WP_Post ) {
			return;
		}

		$language = canetons_post_tree_language( $queried );
		if ( '' === $language ) {
			return;
		}

		$languages = canetons_languages();
		$override  = (string) get_post_meta( $queried->ID, '_canetons_lang_alt', true );

		$urls = array( $language => (string) get_permalink( $queried ) );

		foreach ( $languages as $slug => $tag ) {
			if ( $slug === $language ) {
				continue;
			}

			if ( '' !== $override ) {
				$urls[ $slug ] = $override;
				continue;
			}

			$landing       = get_page_by_path( $slug );
			$urls[ $slug ] = $landing
				? (string) get_permalink( $landing )
				: home_url( '/' . $slug . '/' );
		}

		foreach ( $urls as $slug => $url ) {
			printf(
				'<link rel="alternate" hreflang="%s" href="%s" />' . "\n",
				esc_attr( $languages[ $slug ] ),
				esc_url( $url )
			);
		}

		$default = canetons_default_language();
		if ( isset( $urls[ $default ] ) ) {
			printf(
				'<link rel="alternate" hreflang="x-default" href="%s" />' . "\n",
				esc_url( $urls[ $default ] )
			);
		}
	}
);

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
 * The wp_navigation menu title per language tree. Filterable, so renaming a menu
 * in wp-admin needs no theme edit.
 *
 * @return array<string, string>
 */
function canetons_language_menus(): array {
	return (array) apply_filters(
		'canetons_language_menus',
		array(
			'fr' => 'Menu FR',
			'de' => 'Menu DE',
		)
	);
}

/** The wp_navigation post id for a language tree, or 0 when it has no menu. */
function canetons_language_menu_id( string $language ): int {
	$titles = canetons_language_menus();
	if ( ! isset( $titles[ $language ] ) ) {
		return 0;
	}

	$found = get_posts(
		array(
			'post_type'      => 'wp_navigation',
			'post_status'    => 'publish',
			'title'          => $titles[ $language ],
			'posts_per_page' => 1,
			'fields'         => 'ids',
			'no_found_rows'  => true,
		)
	);

	return empty( $found ) ? 0 : (int) $found[0];
}

/**
 * Give each language tree its own header navigation.
 *
 * WordPress has no per-language menu — supplying one is a large part of what a
 * multilingual plugin is for — and a block theme's header carries a single
 * core/navigation block with no `ref`. Core then resolves it through
 * WP_Navigation_Fallback, which returns the most recently MODIFIED wp_navigation
 * post, so both trees render whichever menu happened to be saved last. Deriving
 * the menu from the current tree instead is what makes the header bilingual
 * without a plugin and without overriding the inherited header.
 *
 * Only an unresolved navigation is touched. A block carrying an explicit `ref`
 * was deliberately pinned to one menu, and a block with inner blocks holds its
 * own links, so both are left exactly as authored.
 */
add_filter(
	'render_block_data',
	static function ( array $parsed ): array {
		if ( 'core/navigation' !== ( $parsed['blockName'] ?? '' ) ) {
			return $parsed;
		}
		if ( ! empty( $parsed['attrs']['ref'] ) || ! empty( $parsed['innerBlocks'] ) ) {
			return $parsed;
		}

		$menu_id = canetons_language_menu_id( canetons_current_language() );
		if ( $menu_id > 0 ) {
			$parsed['attrs']['ref'] = $menu_id;
		}

		return $parsed;
	}
);

/**
 * German labels for the planning list on the /de/ tree.
 *
 * The plugin is French-only by design and stays that way: it exposes these three
 * filters with French defaults, and the bilingual layer — this theme — supplies
 * German where the tree is German. That keeps the "no translation layer"
 * principle intact, with no gettext and no .po files for three strings.
 *
 * Dates are numeric on the German side rather than "Samstag 22. August 2026",
 * because full German month names would need switch_to_locale() around the
 * render, which changes every translated string in that scope — disproportionate
 * for one line of output.
 */
add_filter(
	'canetons_planning_empty_text',
	static function ( string $text ): string {
		return 'de' === canetons_current_language() ? 'Keine bevorstehenden Termine.' : $text;
	}
);

add_filter(
	'canetons_planning_attire_label',
	static function ( string $label ): string {
		return 'de' === canetons_current_language() ? 'Kleidung: ' : $label;
	}
);

add_filter(
	'canetons_planning_date_format',
	static function ( array $formats ): array {
		if ( 'de' !== canetons_current_language() ) {
			return $formats;
		}

		return array(
			'single'      => 'd.m.Y',
			'range_start' => 'd.m.',
			'range_end'   => 'd.m.Y',
		);
	}
);

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

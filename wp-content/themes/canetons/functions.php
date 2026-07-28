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

<?php
/**
 * Instrument sections (spec §3.3, §1.3).
 *
 * One source of truth for the band's sections, replacing the old application's
 * duplication between an `instruments` table and hardcoded JavaScript. Stored on
 * a member as the user meta {@see self::META_KEY}; set by an administrator on
 * the user-profile screen (see {@see Profile}).
 *
 * The canonical value is an English slug (per the language convention: stored
 * values are English identifiers); the French label is what is shown on screen.
 * The membership import (spec §7, a later plan) maps the old French section
 * names onto these slugs.
 *
 * The list is exposed through the `canetons_instruments` filter so a later plan
 * — or a site owner — can extend it without editing this file.
 */

declare( strict_types=1 );

namespace Canetons\Planning;

final class Instruments {
	/** User-meta key holding a member's section slug. */
	public const META_KEY = 'canetons_instrument';

	/** Filter name for extending or reordering the list. */
	public const FILTER = 'canetons_instruments';

	/**
	 * Canonical sections: slug => French label. The nine sections of spec §1.3.
	 *
	 * @var array<string, string>
	 */
	private const DEFAULTS = array(
		'trumpet'    => 'Trompette',
		'trombone'   => 'Trombone',
		'sousaphone' => 'Sousaphone',
		'bells'      => 'Cloches',
		'drums'      => 'Batterie',
		'lyre'       => 'Lyre',
		'bass_drum'  => 'Grosses-Caisse',
		'committee'  => 'Comité',
		'makeup'     => 'Maquillage',
	);

	/**
	 * All sections as slug => French label, after the `canetons_instruments`
	 * filter.
	 *
	 * The filter is applied only when WordPress is loaded, so this method (and
	 * everything built on it) stays callable in the unit suite, which boots no
	 * WordPress. At runtime the filter always runs.
	 *
	 * @return array<string, string>
	 */
	public static function all(): array {
		$instruments = self::DEFAULTS;

		if ( function_exists( 'apply_filters' ) ) {
			/** @var array<string, string> $instruments */
			$instruments = apply_filters( self::FILTER, $instruments );
		}

		return $instruments;
	}

	/**
	 * The section slugs.
	 *
	 * @return list<string>
	 */
	public static function slugs(): array {
		return array_keys( self::all() );
	}

	/** The French label for a slug, or null if the slug is unknown. */
	public static function label( string $slug ): ?string {
		return self::all()[ $slug ] ?? null;
	}

	/** Whether a slug names a known section. */
	public static function is_valid( string $slug ): bool {
		return array_key_exists( $slug, self::all() );
	}

	/**
	 * Sanitize callback for the user meta: a known slug passes through, anything
	 * else (including a non-string, or "no section") becomes the empty string.
	 * Registered via register_meta(), so it also runs on every update.
	 *
	 * @param mixed $value
	 */
	public static function sanitize( $value ): string {
		if ( ! is_string( $value ) ) {
			return '';
		}

		return self::is_valid( $value ) ? $value : '';
	}

	/**
	 * Register the user meta with its sanitize callback. Hooked on `init`.
	 *
	 * `show_in_rest` is false: members are managed in wp-admin, and the section
	 * is not public data.
	 */
	public static function register_meta(): void {
		register_meta(
			'user',
			self::META_KEY,
			array(
				'type'              => 'string',
				'single'            => true,
				'default'           => '',
				'show_in_rest'      => false,
				'sanitize_callback' => array( self::class, 'sanitize' ),
			)
		);
	}
}

<?php
/**
 * TEMPORARY DIAGNOSTIC — delete once the WPLANG investigation is finished.
 *
 * The site locale has silently reverted from fr_FR to an empty value (en_US)
 * twice, and a snapshot proved the empty value then propagates through
 * wp:restore — and would propagate through the Phase 5 export to TEST. Two
 * hypotheses were already refuted with evidence: installing/uninstalling de_CH
 * does not clear it, and the integration harness points at the separate
 * `wordpress_test` database.
 *
 * This logs every write to the option, with a backtrace, the SAPI and the argv, so
 * the culprit names itself instead of being guessed at. Output goes to
 * wp-content/wplang-trace.log.
 *
 * It is deliberately left ARMED. The fault has not been reproduced on demand, and
 * these candidates were each exonerated by running them with this tracer in place
 * and comparing the option before and after — do not spend time re-testing them:
 *
 *   - the integration suite (it also points at the separate wordpress_test DB)
 *   - browsing wp-admin while logged in (dashboard, options-general, plugins,
 *     update-core, profile, the events list)
 *   - deactivating and reactivating canetons-planning
 *   - switching themes away and back
 *   - bulk wp_insert_user / wp_delete_user, as `canetons migrate` performs
 *   - a fresh third-party plugin install + activation (wp-dark-mode), which also
 *     exercises WordPress's translation-pack machinery
 *   - installing and uninstalling the de_CH language pack
 *
 * The tracer is calibrated: forcing `update_option( 'WPLANG', '' )` produces a
 * logged line with a full backtrace. That check matters, because two earlier
 * versions of it were silently broken — error_log() goes to /dev/stderr in the
 * wp-cli container (WP_DEBUG_LOG is false there), and a trace file pre-created by
 * root cannot be appended to by the wp-cli container's uid 33, with
 * file_put_contents failing silently under WP_DEBUG_DISPLAY=false. An
 * uncalibrated tracer reports innocence everywhere.
 *
 * Delete this file once a trace has been captured and the cause fixed.
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Append to our OWN file rather than using error_log().
 *
 * error_log() is not a reliable collector across these containers: in the wp-cli
 * container WP_DEBUG_LOG is false and ini error_log is /dev/stderr, so tracer
 * output went to stderr and was discarded by the runner — which made a working
 * hook look like a silent one. A file we open ourselves behaves the same under
 * Apache, WP-CLI and PHPUnit.
 */
function canetons_wplang_log( string $line ): void {
	file_put_contents(
		WP_CONTENT_DIR . '/wplang-trace.log',
		$line . "\n",
		FILE_APPEND
	);
}

/** One compact line of context for whichever request is writing. */
function canetons_wplang_context(): string {
	$sapi = PHP_SAPI;
	$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) $_SERVER['REQUEST_URI'] : '(no uri)';
	$argv = isset( $GLOBALS['argv'] ) && is_array( $GLOBALS['argv'] )
		? implode( ' ', array_slice( $GLOBALS['argv'], 0, 8 ) )
		: '(no argv)';

	return "sapi={$sapi} uri={$uri} argv={$argv}";
}

/** Where the write came from, deepest frames first. */
function canetons_wplang_trace(): string {
	$summary = wp_debug_backtrace_summary( null, 0, false );

	return implode( ' <- ', array_slice( (array) $summary, 0, 30 ) );
}

add_filter(
	'pre_update_option_WPLANG',
	static function ( $value, $old_value ) {
		canetons_wplang_log(
			sprintf(
				'[WPLANG] update new=%s old=%s %s',
				var_export( $value, true ),
				var_export( $old_value, true ),
				canetons_wplang_context()
			)
		);
		canetons_wplang_log( "[WPLANG] trace: " . canetons_wplang_trace() );

		return $value;
	},
	10,
	2
);

add_action(
	'add_option',
	static function ( $option, $value ): void {
		if ( 'WPLANG' !== $option ) {
			return;
		}

		canetons_wplang_log( "[WPLANG] add value=" . var_export( $value, true ) . " " . canetons_wplang_context() );
		canetons_wplang_log( "[WPLANG] trace: " . canetons_wplang_trace() );
	},
	10,
	2
);

add_action(
	'delete_option',
	static function ( $option ): void {
		if ( 'WPLANG' !== $option ) {
			return;
		}

		canetons_wplang_log( "[WPLANG] delete " . canetons_wplang_context() );
		canetons_wplang_log( "[WPLANG] trace: " . canetons_wplang_trace() );
	}
);

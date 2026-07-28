<?php
/**
 * Local development only: routes all outbound mail to Mailpit.
 *
 * Mounted into the container from docker/wp/mu-plugins/ and NEVER deployed —
 * the deploy artifact is two directories and this is not in either.
 *
 * On real servers this job belongs to FluentSMTP (spec §4), configured per
 * server through wp-admin. Local development deliberately does not install
 * FluentSMTP: both hook `phpmailer_init`, so running both would mean debugging
 * whichever won. The trade-off is that FluentSMTP's own configuration is
 * verified on TEST rather than locally.
 *
 * Without this, mail fails SILENTLY: wp_mail() falls back to PHP's mail(), and
 * the official WordPress image has no sendmail binary. The contact form would
 * look like it worked.
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action(
	'phpmailer_init',
	static function ( $phpmailer ): void {
		$phpmailer->isSMTP();
		$phpmailer->Host     = 'wp-mailpit';
		$phpmailer->Port     = 1025;
		$phpmailer->SMTPAuth = false;
		// Mailpit speaks plain SMTP; PHPMailer would otherwise attempt STARTTLS
		// and fail the send.
		$phpmailer->SMTPAutoTLS = false;
	}
);

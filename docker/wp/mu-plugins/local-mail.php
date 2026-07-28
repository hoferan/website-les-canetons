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

/**
 * Override the default From address, which is invalid on this site.
 *
 * WordPress builds it as 'wordpress@' . <site host>. Locally that host is
 * `localhost`, giving `wordpress@localhost` — and PHPMailer validates addresses
 * with FILTER_VALIDATE_EMAIL, which REJECTS a domain with no dot. Every send
 * then fails with "Invalid address (From)" and wp_mail() returns false.
 *
 * This is a local-only fault, which is why the fix lives here: TEST
 * (test.lescanetons.org) and PROD (lescanetons.org) have dotted hosts, so their
 * default From validates. On those servers the From address is FluentSMTP's
 * concern and must be a real authenticated mailbox (spec §4).
 *
 * `.invalid` is reserved by RFC 2606, so it can never resolve or deliver to a
 * real recipient — the same reasoning as the synthetic member addresses in
 * spec §7.
 */
add_filter( 'wp_mail_from', static fn (): string => 'no-reply@lescanetons.invalid' );
add_filter( 'wp_mail_from_name', static fn (): string => 'Les Canetons (local)' );

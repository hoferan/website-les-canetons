<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\SecurityDocumentation\MiddlewareAuthSecurityStrategy;
use Dedoc\Scramble\Support\Generator\SecurityScheme;

/**
 * Declares how this API is authenticated, so whether an operation needs a
 * session is stated in the document instead of inferred from a declared 401.
 *
 * Scramble's own MiddlewareAuthSecurityStrategy does the work: it reads
 * `auth:*` off each route, applies the scheme at the root, and marks every
 * operation without that middleware `security: []`. This subclass changes two
 * things.
 *
 * A cookie, not a bearer token. The strategy's default scheme is
 * `SecurityScheme::http('bearer')`, which would be wrong: no request to this
 * API carries an Authorization header, and a client written against that
 * would never authenticate.
 *
 * The cookie is named by configuration. `session.cookie` derives from APP_NAME
 * unless a server sets SESSION_COOKIE, so a name written into the document by
 * hand would drift. It is read here rather than in config/scramble.php because
 * a config file cannot reliably read another one: the loader's order decides,
 * and `scramble` sorts before `session`.
 *
 * An `apiKey`-in-cookie scheme is how OpenAPI describes a cookie credential,
 * and browsers send it automatically. The X-XSRF-TOKEN header that mutating
 * requests also need is CSRF defence in depth behind SameSite=Strict, not a
 * second credential, so the reference's prose documents it instead of a
 * scheme somebody could mistake for a way in.
 */
class DocumentsTheSessionCookie extends MiddlewareAuthSecurityStrategy
{
    public function __construct()
    {
        parent::__construct(
            middleware: ['auth', 'auth:*'],
            // Named `sessionCookie` rather than left at Scramble's `apiKey`.
            // The key is what every operation references and what a code
            // generator turns into an identifier, so it should say what the
            // credential is, not which of OpenAPI's four families it belongs to.
            scheme: SecurityScheme::apiKey('cookie', (string) config('session.cookie'))
                ->as('sessionCookie')
                ->setDescription(
                    'The session cookie, set by POST /api/v1/login and sent automatically by a '
                    .'browser. It is HttpOnly, so it cannot be read from JavaScript, and there is '
                    .'nothing for a client to store or attach by hand.'
                ),
        );
    }
}

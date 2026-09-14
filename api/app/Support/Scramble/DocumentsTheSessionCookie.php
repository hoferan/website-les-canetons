<?php

namespace App\Support\Scramble;

use Dedoc\Scramble\SecurityDocumentation\MiddlewareAuthSecurityStrategy;
use Dedoc\Scramble\Support\Generator\SecurityScheme;

/**
 * Declares how this API is authenticated, so "does this need a session" stops
 * being something a reader infers.
 *
 * Until 2026-09-11 the document had no `securitySchemes` at all, and no
 * operation carried `security`. The only machine-readable clue was whether 401
 * was among the declared responses — which is an inference, not a statement, and
 * it was wrong on every operation where 401 could arise for another reason.
 *
 * Scramble's own MiddlewareAuthSecurityStrategy does all of the work: it reads
 * `auth:*` off each route, applies the scheme at the root, and marks every
 * operation without that middleware `security: []`. Two things make this
 * subclass worth its file.
 *
 * A COOKIE, NOT A BEARER TOKEN. The strategy's default scheme is
 * `SecurityScheme::http('bearer')`, which would be a straightforward lie: there
 * is no Authorization header anywhere in this API, and a client written against
 * that would never authenticate. What it sends is a session cookie.
 *
 * AND THE COOKIE IS NAMED BY CONFIGURATION. `session.cookie` derives from
 * APP_NAME unless a server sets SESSION_COOKIE, so writing the name into the
 * document by hand would be a copy that drifts the day either changes. It is
 * read here rather than in config/scramble.php because a config file cannot
 * reliably read another one — the loader's order decides, and `scramble` sorts
 * before `session`.
 *
 * Worth knowing while reading it: an `apiKey`-in-cookie scheme is how OpenAPI
 * describes a cookie credential, and browsers send it automatically. The
 * X-XSRF-TOKEN header that mutating requests also need is not a second
 * credential — it is CSRF defence in depth behind SameSite=Strict — so it is
 * documented in the reference's prose rather than declared here as a scheme
 * somebody could mistake for a way in.
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
            // credential IS, not which of OpenAPI's four families it belongs to.
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

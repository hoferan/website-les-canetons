<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiError;
use App\Support\FormToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The anti-abuse guard on the API's two anonymous write endpoints: the contact
 * form and public event registration (ADR 0019).
 *
 * Two server-side checks:
 *
 *   1. A honeypot field that must arrive empty. A form-filling bot fills every
 *      input it finds; a human never sees this one.
 *   2. A signed timestamp issued by GET /api/v1/form-token. A submission under
 *      two seconds old was not typed by a person. App\Support\FormToken says
 *      why it is stateless and not single-use.
 *
 * ALTCHA's proof-of-work is left out (ADR 0019): it needs a browser widget, and
 * its cost falls hardest on an old phone.
 *
 * Both checks share one refusal that does not say which failed, so a script
 * learns nothing about how to pass. 422 and not 400: the request is well-formed
 * and its fields valid; the submission itself is what is wrong.
 */
class PublicWriteGuard
{
    /**
     * The decoy field. Named like something a bot wants to fill and a
     * committee would never ask for.
     */
    public const HONEYPOT_FIELD = 'website';

    /** Where the signed stamp travels. A header, so it stays out of every
     * request body's schema and out of the generated client's types. */
    public const TOKEN_HEADER = 'X-Form-Token';

    public function handle(Request $request, Closure $next): Response
    {
        // Present and empty. filled(null) is false, so checking only for a
        // value would let a hand-written body pass by omitting the field. A
        // real form always sends it.
        $honeypotMissing = ! $request->has(self::HONEYPOT_FIELD);
        $honeypotFilled = filled($request->input(self::HONEYPOT_FIELD));

        if ($honeypotMissing || $honeypotFilled || ! FormToken::isValid($request->header(self::TOKEN_HEADER))) {
            return ApiError::json(422, 'spam_suspected', 'This submission looks automated');
        }

        return $next($request);
    }
}

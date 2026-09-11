<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiError;
use App\Support\FormToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The only thing standing in front of this API's two ANONYMOUS write
 * endpoints: the contact form and public event registration.
 *
 * WHY IT EXISTS AT ALL. §6 of the rebuild spec required honeypot plus
 * submit-timing plus Altcha "applied generically to both public write
 * endpoints". That requirement was orphaned across three release slicings —
 * R1 covered the members' tool, R2 the public pages, R3 registration, and
 * none of them claimed the contact form — so POST /api/v1/contact shipped with
 * no protection of any kind and still had none when R3 was designed. This is
 * the owner it never had.
 *
 * TWO CHECKS, both server-side:
 *
 *   1. A HONEYPOT field that must arrive empty. A form-filling bot fills
 *      every input it finds; a human never sees this one.
 *   2. A SIGNED TIMESTAMP issued by GET /api/v1/form-token. A submission under
 *      two seconds old was not typed by a person. See App\Support\FormToken
 *      for why it is stateless and not single-use.
 *
 * ALTCHA'S PROOF-OF-WORK IS DELIBERATELY ABSENT (R3 spec §9). It needs a
 * browser widget, so it cannot be finished server-side, and its cost falls
 * hardest on a parent with an old phone. These two are the two thirds that
 * are free.
 *
 * ONE REFUSAL FOR BOTH, and no detail about which check failed: telling a
 * script whether it tripped the honeypot or the clock is telling it how to
 * pass next time. 422 rather than 400 — the request is well-formed and the
 * fields are individually valid; what is wrong is the submission itself.
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
        // PRESENT AND EMPTY, not merely empty. MEASURED 2026-09-10:
        // filled(null) is false, so checking only whether the field has a
        // value let a caller pass by OMITTING it entirely — which is what
        // any script that posts a hand-written body does, and exactly the
        // case a honeypot is supposed to catch. A real form always sends
        // the field, so requiring its presence costs a browser nothing.
        $honeypotMissing = ! $request->has(self::HONEYPOT_FIELD);
        $honeypotFilled = filled($request->input(self::HONEYPOT_FIELD));

        if ($honeypotMissing || $honeypotFilled || ! FormToken::isValid($request->header(self::TOKEN_HEADER))) {
            return ApiError::json(422, 'spam_suspected', 'This submission looks automated');
        }

        return $next($request);
    }
}

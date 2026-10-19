<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\FormToken;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;

#[Group('Public forms', weight: 60)]
class FormTokenController extends Controller
{
    /**
     * Issue a form token for a public form.
     *
     * Anonymous, and no session is required. Rate limited to 10 a minute per
     * IP.
     *
     * Returns `{"token": "..."}`, to be sent back as the `X-Form-Token`
     * header on a public write: `POST /api/v1/contact` and
     * `POST /api/v1/events/{event}/registrations`.
     *
     * Fetch it when the form is rendered, not when it is submitted. The
     * submission guard refuses a token less than two seconds old, so
     * requesting one at submit time would refuse every real person. A token
     * stays valid for two hours and may be sent more than once, so a
     * submission that fails validation can be retried with the token already
     * in hand.
     */
    #[Response(200, 'A token to send back as X-Form-Token. Valid for two hours, usable more than once.')]
    #[Endpoint(operationId: 'formToken.show')]
    public function __invoke(): JsonResponse
    {
        // Public and ungated, since an anonymous visitor fetches it before
        // submitting anything. The token is an HMAC of the current time, so it
        // reveals nothing, and the submission still has to pass the honeypot.
        //
        // Throttled anyway (routes/api.php): it is the first step of the loop
        // the write limiter exists to stop, and an open endpoint lets a caller
        // bank tokens.
        //
        // App\Support\FormToken explains why it is stateless, not single-use,
        // and fails closed on a blank APP_KEY.
        $body = ['token' => FormToken::issue()];

        return response()->json($body);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\FormToken;
use Illuminate\Http\JsonResponse;

/**
 * Issues the signed stamp a public form must send back with its submission.
 *
 * PUBLIC AND UNGATED, necessarily: it is fetched by an anonymous visitor
 * before they have submitted anything. It reveals nothing — the token is an
 * HMAC of the current time — and it grants nothing on its own, because the
 * submission still has to pass the honeypot.
 *
 * Fetched when the form is RENDERED, not when it is submitted. Requesting it
 * at submit time would make the age of the token the age of that request,
 * which is always zero, and the timing check would refuse every real person.
 */
class FormTokenController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['token' => FormToken::issue()]);
    }
}

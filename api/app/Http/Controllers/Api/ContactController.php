<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContactRequest;
use App\Models\ContactMessage;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;

#[Group('Public forms', weight: 60)]
class ContactController extends Controller
{
    /**
     * Send a message to the committee.
     *
     * Anonymous, and protected against automated submission: send the
     * `X-Form-Token` header from `GET /api/form-token` and a `website` field
     * that is present and empty, or the request answers `422 spam_suspected`.
     * Fetch that token when the form is rendered rather than when it is
     * submitted, because one less than two seconds old is refused. Rate
     * limited to 10 a minute per IP.
     *
     * Stores the message for the committee to read and answers
     * `{"ok": true}`. Nothing is sent back to the address given.
     *
     * A missing or malformed field answers `400 validation_failed`, with each
     * problem named in `fields[]`.
     */
    public function __invoke(ContactRequest $request): JsonResponse
    {
        // Store raw input; escape at output time (not at storage time).
        //
        // The two anti-abuse halves both live outside this method, in the
        // route's middleware: PublicWriteGuard (honeypot + signed stamp) and
        // the `public-write` throttle. See routes/api.php for why the
        // throttle is the half that matters — the stamp is not bound to a
        // caller and stays replayable for two hours.
        ContactMessage::create([
            'last_name' => trim($request->input('lastName')),
            'first_name' => trim($request->input('firstName')),
            'email' => trim($request->input('email')),
            'subject' => trim($request->input('subject')),
            'message' => trim($request->input('message')),
        ]);

        return response()->json(['ok' => true]);
    }
}

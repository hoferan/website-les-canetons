<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ContactRequest;
use App\Mail\ContactMessageReceived;
use App\Models\ContactMessage;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

#[Group('Public forms', 'What an anonymous visitor may send, and the stamp every such submission carries. Rate limited.', weight: 60)]
class ContactController extends Controller
{
    /**
     * Send a message to the committee.
     *
     * Anonymous, and protected against automated submission: send the
     * `X-Form-Token` header from `GET /api/v1/form-token` and a `website` field
     * that is present and empty, or the request answers `422 spam_suspected`.
     * Fetch that token when the form is rendered rather than when it is
     * submitted, because one less than two seconds old is refused. Rate
     * limited to 10 a minute per IP.
     *
     * Stores the message and answers `{"ok": true}`. The committee reads it in
     * their inbox at `GET /api/v1/inbox`, and is notified by mail so nobody has
     * to remember to look. Nothing is sent to the address the visitor gave.
     *
     * A missing or malformed field answers `400 validation_failed`, with each
     * problem named in `fields[]`.
     */
    #[Response(200, 'Stored for the committee to read in their inbox, and mailed to them. Nothing is sent to the address the visitor gave.')]
    #[Endpoint(operationId: 'contact.store')]
    public function __invoke(ContactRequest $request): JsonResponse
    {
        // Stores raw input; escaping happens at output time.
        //
        // The anti-abuse checks live in the route's middleware: PublicWriteGuard
        // (honeypot and signed stamp) and the `public-write` throttle. The
        // throttle is the half that matters, because the stamp is not bound to
        // a caller and stays replayable for two hours (routes/api.php).
        $message = ContactMessage::create([
            'last_name' => trim($request->input('lastName')),
            'first_name' => trim($request->input('firstName')),
            'email' => trim($request->input('email')),
            'subject' => trim($request->input('subject')),
            'message' => trim($request->input('message')),
        ]);

        self::notify($message);

        return response()->json(['ok' => true]);
    }

    /**
     * Tells the committee, and never lets that fail the submission.
     *
     * Best-effort, like the booking confirmation (ADR 0009). The row is
     * already in the inbox, the host has no queue to retry from, and an SMTP
     * failure must not answer the visitor with an error for a stored message.
     *
     * The recipient is MAIL_COMMITTEE_ADDRESS, set by hand on every server.
     * An unset or placeholder value throws here and is logged, with no
     * fallback to the sending mailbox: that would deliver to a noreply@ and
     * look like success.
     *
     * Logged at error, since .env.example sets LOG_LEVEL=error and a warning
     * would never be written. See RegistrationController::confirm().
     */
    private static function notify(ContactMessage $message): void
    {
        try {
            Mail::to(config('mail.committee.address'))->send(new ContactMessageReceived($message));
        } catch (\Throwable $e) {
            Log::error('Contact message notification mail failed', [
                'contact_message_id' => $message->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

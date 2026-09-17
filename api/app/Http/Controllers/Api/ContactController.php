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
        // Store raw input; escape at output time (not at storage time).
        //
        // The two anti-abuse halves both live outside this method, in the
        // route's middleware: PublicWriteGuard (honeypot + signed stamp) and
        // the `public-write` throttle. See routes/api.php for why the
        // throttle is the half that matters — the stamp is not bound to a
        // caller and stays replayable for two hours.
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
     * BEST-EFFORT ON PURPOSE, as the booking confirmation is (decision G5).
     * The row is committed and readable in the inbox either way, this host has
     * no queue to retry from, and the visitor did nothing wrong — so an SMTP
     * blip must not answer them with an error for a message that was stored.
     *
     * The recipient is MAIL_COMMITTEE_ADDRESS, which every server sets by
     * hand. An unset or placeholder value throws here and is logged rather
     * than falling back to the sending mailbox: a fallback would deliver the
     * notification to a noreply@ and look like success.
     *
     * error, not warning: .env.example sets LOG_LEVEL=error and warning sits
     * below it in Monolog, so a warning here would never be written on any
     * server. That exact bug hid broken registration mail once already; see
     * RegistrationController::confirm().
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

<?php

namespace App\Mail;

use App\Models\Event;
use App\Models\Registration;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The receipt a guest gets after booking.
 *
 * NOT queued, and it does not implement ShouldQueue. This host has no queue
 * worker and no way to run one — no shell, no supervisor, and a cron job
 * would have to be configured by hand on each of TEST, QA and PROD, with a
 * failure mode of mail that silently never sends. RegistrationController
 * sends it inline after the transaction commits and swallows any failure,
 * so a flaky SMTP cannot throw away a booking that is already stored
 * (decision G5).
 *
 * THE ONLY FRENCH IN THE API, and a deliberate exception to the project
 * rule that API bodies are English. The rule exists because
 * web/src/i18n/ is the single place French is computed for anything a
 * BROWSER renders — but no browser renders this. It is addressed directly
 * to a French-speaking guest, and there is no display layer between here
 * and them to translate it.
 */
class RegistrationConfirmation extends Mailable
{
    public function __construct(
        public readonly Registration $registration,
        public readonly Event $event,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Confirmation d’inscription — '.$this->event->title,
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.registration-confirmation',
            with: [
                'registration' => $this->registration,
                'event' => $this->event,
            ],
        );
    }
}

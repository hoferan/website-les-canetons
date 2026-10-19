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
 * Not queued, and it does not implement ShouldQueue. This host has no queue
 * worker and no way to run one (no shell, no supervisor; a cron job would be
 * set up by hand on every server, and mail would silently never send when it
 * broke). RegistrationController sends it inline after the transaction
 * commits and swallows any failure, so a flaky SMTP cannot throw away a
 * stored booking (ADR 0009).
 *
 * French, a deliberate exception to the rule that API bodies are English:
 * web/src/i18n/ translates what a browser renders, and no browser renders
 * this. It goes straight to a French-speaking guest.
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

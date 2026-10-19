<?php

namespace App\Mail;

use App\Models\ContactMessage;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Tells the committee that somebody wrote to them through the public form.
 *
 * The message is stored either way and readable at /inbox; this exists so
 * nobody has to remember to look. Addressed to config('mail.committee.address')
 * rather than the sending mailbox, which holds the SMTP credentials and is
 * usually a noreply@ nobody opens.
 *
 * This alerts; /contact-messages answers. That screen offers the visitor's
 * address as a mailto link and records who handled the message and when. A
 * reply from the mail client leaves the message open on the worklist, so the
 * body links into the app instead of inviting a reply.
 *
 * Reply-To is still the visitor, as a fallback for whoever replies anyway.
 * From stays the site's own mailbox, because a stranger's address there fails
 * SPF at the receiving end.
 *
 * Not queued: this host has no queue worker (see RegistrationConfirmation).
 * ContactController sends it inline and swallows any failure, so a flaky SMTP
 * cannot turn a stored message into an error page.
 *
 * French, like RegistrationConfirmation and for the same reason: no browser
 * renders it, so web/src/i18n/ cannot reach it, and the committee reads
 * French.
 */
class ContactMessageReceived extends Mailable
{
    public function __construct(public readonly ContactMessage $message) {}

    public function envelope(): Envelope
    {
        // `subject` is nullable in the schema, and the inbox screen already
        // copes with that; the mail client's subject line has to as well.
        $subject = trim((string) $this->message->subject);

        return new Envelope(
            subject: 'Message du site — '.($subject !== '' ? $subject : 'sans sujet'),
            replyTo: [new Address($this->message->email, $this->senderName())],
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'mail.contact-message-received',
            with: ['message' => $this->message],
        );
    }

    private function senderName(): string
    {
        return trim($this->message->first_name.' '.$this->message->last_name);
    }
}

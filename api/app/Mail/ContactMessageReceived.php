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
 * The message is stored either way and readable in the inbox at /inbox; this
 * exists so nobody has to remember to look. Addressed to
 * config('mail.from.address') — the mailbox this host already sends as, so no
 * server needs a new key in its .env and no deploy is refused by the
 * config-shape pre-flight over it.
 *
 * REPLY-TO IS THE VISITOR, so answering is one tap in the mail client rather
 * than a copy-paste out of the inbox screen. The From stays the site's own
 * mailbox: putting a stranger's address there is what makes a message fail SPF
 * at the receiving end.
 *
 * NOT queued, and it does not implement ShouldQueue, for the reason
 * RegistrationConfirmation gives at length: this host has no queue worker and
 * no way to run one. ContactController sends it inline and swallows any
 * failure, so a flaky SMTP cannot turn a stored message into an error page for
 * somebody who did nothing wrong.
 *
 * FRENCH, like RegistrationConfirmation and by the same exception to the
 * project rule that API bodies are English: no browser renders this, so
 * web/src/i18n/ — the one place French is computed — cannot reach it, and the
 * committee reads French.
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

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
 * config('mail.committee.address'), which is its own key rather than the
 * mailbox the host sends as. Reusing the sending mailbox would have saved
 * every server a hand edit, but that mailbox holds the SMTP credentials and
 * is usually a noreply@ nobody opens, so on a server named the ordinary way
 * the notification would arrive unread and nothing would report it.
 *
 * THIS ALERTS; /contact-messages ANSWERS. That screen already offers the
 * visitor's address as a mailto link, and it records who marked the message
 * handled and when. A reply sent from the mail client instead leaves handled
 * false, so the worklist goes on showing an answered message as open and a
 * second committee member can write back to the same stranger. The body
 * therefore carries a link into the app rather than an invitation to reply
 * here.
 *
 * REPLY-TO IS STILL THE VISITOR, as a fallback for whoever hits reply anyway:
 * it costs nothing and a reply to the site's own mailbox would reach no one.
 * The From stays the site's own mailbox, because putting a stranger's address
 * there is what makes a message fail SPF at the receiving end.
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

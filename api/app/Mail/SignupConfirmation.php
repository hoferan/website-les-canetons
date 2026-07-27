<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The French plain-text signup confirmation sent to the person who signed up.
 *
 * Replaces the old app's App\Mailer: buildBody() is a straight port of
 * Mailer::buildConfirmation()'s body assembly (byte-identical output, quirks
 * included) and envelope() carries the same subject and recipient, while
 * Laravel's Mail system replaces the PHPMailer/SMTP half — host, port, auth,
 * encryption and the From address all come from config/mail.php and the
 * environment instead of the old $config['mail'] section.
 */
class SignupConfirmation extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  array<string,mixed>  $occasion  an App\Support\Occasion::ALL entry
     * @param  array<string,mixed>  $signup  first_name, last_name, email, table_name, menus[]
     */
    public function __construct(
        private array $occasion,
        private array $signup,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            to: [new Address(
                (string) $this->signup['email'],
                trim($this->signup['first_name'].' '.$this->signup['last_name']),
            )],
            subject: 'Confirmation de votre inscription — '.$this->occasion['title'],
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'mail.signup-confirmation-plain',
            with: ['body' => $this->buildBody()],
        );
    }

    /**
     * Assemble the plain-text French body.
     *
     * Public on purpose: it lets the user-visible French wording be asserted
     * directly, with no mail transport and no rendered view in the way.
     *
     * Ported verbatim from App\Mailer::buildConfirmation(), including its
     * treatment of a menu value that is not one of meat/child/vegetarian: such
     * a value is skipped by the per-menu counters but still counted in the
     * total, because the total is the raw size of the menus list. Nothing
     * reaches here with an unknown value (Occasion::normalizeMenus() rejects
     * them first), so this is kept as-is rather than "fixed" — the port must
     * not change the emitted text.
     */
    public function buildBody(): string
    {
        $counts = ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
        foreach ($this->signup['menus'] as $menu) {
            if (isset($counts[$menu])) {
                $counts[$menu]++;
            }
        }
        $total = count($this->signup['menus']);

        return 'Bonjour '.$this->signup['first_name'].' '.$this->signup['last_name'].",\n\n"
            .$this->occasion['teaser']."\n\n"
            .'Date : '.$this->occasion['date_display']."\n\n"
            ."Votre réservation a bien été enregistrée :\n"
            .'- Table : '.$this->signup['table_name']."\n"
            .'- Viande : '.$counts['meat']."\n"
            .'- Enfant : '.$counts['child']."\n"
            .'- Végétarien : '.$counts['vegetarian']."\n"
            .'- Total : '.$total." personne(s)\n\n"
            ."Merci et à bientôt !\n"
            .'Les Canetons de Fribourg';
    }
}

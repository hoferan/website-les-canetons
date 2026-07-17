<?php

/**
 * Thin wrapper over the vendored PHPMailer for the signup confirmation email.
 * Message assembly (buildConfirmation) is pure and unit-tested; sending is
 * isolated in sendConfirmation so callers can wrap it fail-safe.
 */
final class Mailer
{
    /** @param array<string,mixed> $config the $config['mail'] section */
    public function __construct(private array $config)
    {
    }

    /**
     * Build the French confirmation subject + plain-text body.
     *
     * @param array<string,mixed> $occasion an OCCASIONS entry
     * @param array<string,mixed> $signup   first_name,last_name,table_name,menus[]
     * @return array{subject:string,body:string}
     */
    public static function buildConfirmation(array $occasion, array $signup): array
    {
        $counts = ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
        foreach ($signup['menus'] as $m) {
            if (isset($counts[$m])) {
                $counts[$m]++;
            }
        }
        $total = count($signup['menus']);

        $subject = 'Confirmation de votre inscription — ' . $occasion['title'];

        $body = 'Bonjour ' . $signup['first_name'] . " " . $signup['last_name'] . ",\n\n"
            . $occasion['teaser'] . "\n\n"
            . 'Date : ' . $occasion['date_display'] . "\n\n"
            . "Votre réservation a bien été enregistrée :\n"
            . '- Table : ' . $signup['table_name'] . "\n"
            . '- Viande : ' . $counts['meat'] . "\n"
            . '- Enfant : ' . $counts['child'] . "\n"
            . '- Végétarien : ' . $counts['vegetarian'] . "\n"
            . '- Total : ' . $total . " personne(s)\n\n"
            . "Merci et à bientôt !\n"
            . "Les Canetons de Fribourg";

        return ['subject' => $subject, 'body' => $body];
    }

    /**
     * Send the confirmation to the signer via authenticated SMTP.
     * Returns true on success; throws PHPMailer\PHPMailer\Exception on failure.
     */
    public function sendConfirmation(array $occasion, array $signup): bool
    {
        $msg = self::buildConfirmation($occasion, $signup);

        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) $this->config['host'];
        $mail->Port = (int) $this->config['port'];
        $mail->CharSet = 'UTF-8';
        if (($this->config['username'] ?? '') !== '') {
            $mail->SMTPAuth = true;
            $mail->Username = (string) $this->config['username'];
            $mail->Password = (string) $this->config['password'];
        } else {
            $mail->SMTPAuth = false;
        }
        $secure = (string) ($this->config['secure'] ?? '');
        if ($secure === 'ssl') {
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($secure === 'tls') {
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $mail->SMTPSecure = '';
            $mail->SMTPAutoTLS = false;
        }

        $mail->setFrom(
            (string) $this->config['from_email'],
            (string) $this->config['from_name']
        );
        $mail->addAddress(
            (string) $signup['email'],
            trim($signup['first_name'] . ' ' . $signup['last_name'])
        );
        $mail->Subject = $msg['subject'];
        $mail->Body = $msg['body'];

        return $mail->send();
    }
}

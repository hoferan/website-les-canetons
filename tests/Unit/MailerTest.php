<?php

use App\Mailer;
use App\Repositories\SignupRepository;
use PHPUnit\Framework\TestCase;

final class MailerTest extends TestCase
{
    public function testBuildConfirmationSubjectAndBody(): void
    {
        $occasion = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
        $signup = [
            'first_name' => 'Marie',
            'last_name'  => 'Rossier',
            'email'      => 'marie@example.com',
            'table_name' => 'Famille Rossier',
            'menus'      => ['meat', 'meat', 'child'],
        ];
        $msg = Mailer::buildConfirmation($occasion, $signup);

        $this->assertStringContainsString('Souper des 25 ans des Canetons', $msg['subject']);
        $this->assertStringContainsString('Marie', $msg['body']);
        $this->assertStringContainsString('Famille Rossier', $msg['body']);
        $this->assertStringContainsString('13 novembre 2027', $msg['body']);
        // menu summary: 2 viande, 1 enfant, 0 végétarien
        $this->assertStringContainsString('Viande : 2', $msg['body']);
        $this->assertStringContainsString('Enfant : 1', $msg['body']);
    }
}

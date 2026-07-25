<?php

namespace Tests\Feature;

use App\Mail\SignupConfirmation;
use App\Support\Occasion;
use Tests\TestCase;

class SignupConfirmationMailTest extends TestCase
{
    private const SIGNUP = [
        'first_name' => 'Ada',
        'last_name' => 'Lovelace',
        'email' => 'ada@example.com',
        'table_name' => 'Table 1',
        'menus' => ['meat', 'meat', 'child'],
    ];

    public function test_the_subject_names_the_occasion(): void
    {
        $mail = new SignupConfirmation(Occasion::active(), self::SIGNUP);

        $this->assertSame(
            'Confirmation de votre inscription — Souper des 25 ans des Canetons',
            $mail->envelope()->subject
        );
    }

    public function test_the_body_counts_each_menu_and_the_total(): void
    {
        $body = (new SignupConfirmation(Occasion::active(), self::SIGNUP))->buildBody();

        $this->assertStringContainsString('Bonjour Ada Lovelace,', $body);
        $this->assertStringContainsString('- Table : Table 1', $body);
        $this->assertStringContainsString('- Viande : 2', $body);
        $this->assertStringContainsString('- Enfant : 1', $body);
        $this->assertStringContainsString('- Végétarien : 0', $body);
        $this->assertStringContainsString('- Total : 3 personne(s)', $body);
        $this->assertStringContainsString('Les Canetons de Fribourg', $body);
    }

    public function test_an_unknown_menu_value_does_not_inflate_the_counts(): void
    {
        $signup = ['menus' => ['meat', 'bogus']] + self::SIGNUP;

        $body = (new SignupConfirmation(Occasion::active(), $signup))->buildBody();

        $this->assertStringContainsString('- Viande : 1', $body);
        $this->assertStringContainsString('- Total : 2 personne(s)', $body);
    }
}

<?php

use PHPUnit\Framework\TestCase;

final class SignupRepositoryTest extends TestCase
{
    public function testNormalizeMenusAcceptsValidValues(): void
    {
        $this->assertSame(['meat', 'child'], SignupRepository::normalizeMenus(['meat', 'child']));
    }

    public function testNormalizeMenusRejectsUnknownValue(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus(['meat', 'pizza']));
    }

    public function testNormalizeMenusRejectsEmpty(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus([]));
    }

    public function testNormalizeMenusRejectsNonArray(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus('meat'));
    }

    public function testNormalizeMenusRejectsTooMany(): void
    {
        $this->assertNull(SignupRepository::normalizeMenus(array_fill(0, 31, 'meat')));
    }

    public function testComputeStatsTotals(): void
    {
        $stats = SignupRepository::computeStats($this->sampleSignups());
        $this->assertSame(11, $stats['totalPersons']);
        $this->assertSame(3, $stats['totalTables']);
        $this->assertSame(['meat' => 6, 'child' => 2, 'vegetarian' => 3], $stats['menuTotals']);
    }

    public function testComputeStatsGroupsByTable(): void
    {
        $stats = SignupRepository::computeStats($this->sampleSignups());
        $first = $stats['tables'][0];
        $this->assertSame('Famille Rossier', $first['name']);
        $this->assertSame(6, $first['personCount']);
        $this->assertSame(['meat' => 3, 'child' => 2, 'vegetarian' => 1], $first['menuCounts']);
        $this->assertCount(2, $first['signups']);
        $this->assertSame(
            ['meat' => 2, 'child' => 1, 'vegetarian' => 1],
            $first['signups'][0]['menuCounts']
        );
    }

    public function testActiveOccasionHasCopyAndDate(): void
    {
        $o = SignupRepository::OCCASIONS[SignupRepository::ACTIVE_OCCASION];
        $this->assertSame('Souper des 25 ans des Canetons', $o['title']);
        $this->assertSame('Sortie du nouveau costume · Soirée guggen', $o['subtitle']);
        $this->assertSame('2027-11-13', $o['date']);
        $this->assertSame('13 novembre 2027', $o['date_display']);
        $this->assertArrayHasKey('teaser', $o);
        $this->assertArrayHasKey('description', $o);
        $this->assertStringContainsString('13 novembre 2027', $o['teaser']);
    }

    public function testComputeStatsCarriesEmail(): void
    {
        $signups = [[
            'first_name' => 'Marie', 'last_name' => 'Rossier', 'address' => 'A',
            'phone' => 'p', 'email' => 'marie@example.com',
            'table_name' => 'Famille Rossier', 'menus' => ['meat', 'child'],
        ]];
        $stats = SignupRepository::computeStats($signups);
        $this->assertSame('marie@example.com', $stats['tables'][0]['signups'][0]['email']);
    }

    public function testExportRowsHeaderAndValues(): void
    {
        $signups = [[
            'first_name' => 'Marie', 'last_name' => 'Rossier',
            'address' => '1 rue A', 'phone' => '079', 'email' => 'marie@example.com',
            'table_name' => 'Famille Rossier', 'menus' => ['meat', 'meat', 'child'],
        ]];
        $rows = SignupRepository::exportRows($signups);
        $this->assertSame(
            ['Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
                'Viande', 'Enfant', 'Végétarien', 'Total'],
            $rows[0]
        );
        $this->assertSame(
            ['Famille Rossier', 'Rossier', 'Marie', 'marie@example.com',
                '1 rue A', '079', 2, 1, 0, 3],
            $rows[1]
        );
    }

    public function testExportRowsNeutralizesFormulaInjection(): void
    {
        $signups = [[
            'first_name' => '=cmd', 'last_name' => 'X', 'address' => 'A',
            'phone' => 'p', 'email' => 'e@e.ch',
            'table_name' => 'T', 'menus' => ['meat'],
        ]];
        $rows = SignupRepository::exportRows($signups);
        $this->assertSame("'=cmd", $rows[1][2]); // Prénom column, quoted
    }

    /** @return array<int,array> */
    private function sampleSignups(): array
    {
        return [
            ['first_name' => 'Marie', 'last_name' => 'Rossier', 'address' => 'A', 'phone' => 'p',
                'table_name' => 'Famille Rossier', 'menus' => ['meat', 'meat', 'child', 'vegetarian']],
            ['first_name' => 'Luc', 'last_name' => 'Rossier', 'address' => 'A', 'phone' => 'p',
                'table_name' => 'Famille Rossier', 'menus' => ['meat', 'child']],
            ['first_name' => 'Jean', 'last_name' => 'Python', 'address' => 'B', 'phone' => 'p',
                'table_name' => 'Les voisins', 'menus' => ['meat', 'meat']],
            ['first_name' => 'Sophie', 'last_name' => 'Aebischer', 'address' => 'C', 'phone' => 'p',
                'table_name' => 'Copains musique', 'menus' => ['meat', 'vegetarian', 'vegetarian']],
        ];
    }
}

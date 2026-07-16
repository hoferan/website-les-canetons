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

<?php

namespace Tests\Unit;

use App\Support\SignupStats;
use PHPUnit\Framework\TestCase;

class SignupStatsTest extends TestCase
{
    private const SIGNUPS = [
        [
            'first_name' => 'Ada', 'last_name' => 'Lovelace',
            'address' => 'Rue 1', 'phone' => '079', 'email' => 'ada@example.com',
            'table_name' => 'Table 1', 'menus' => ['meat', 'child'],
        ],
        [
            'first_name' => 'Alan', 'last_name' => 'Turing',
            'address' => 'Rue 2', 'phone' => '078', 'email' => 'alan@example.com',
            'table_name' => 'Table 1', 'menus' => ['vegetarian'],
        ],
        [
            'first_name' => 'Grace', 'last_name' => 'Hopper',
            'address' => 'Rue 3', 'phone' => '077', 'email' => 'grace@example.com',
            'table_name' => 'Table 2', 'menus' => ['meat'],
        ],
    ];

    public function test_it_totals_persons_and_tables(): void
    {
        $stats = SignupStats::compute(self::SIGNUPS);

        $this->assertSame(4, $stats['totalPersons']);
        $this->assertSame(2, $stats['totalTables']);
        $this->assertSame(['meat' => 2, 'child' => 1, 'vegetarian' => 1], $stats['menuTotals']);
    }

    public function test_it_groups_signups_by_table_preserving_order(): void
    {
        $stats = SignupStats::compute(self::SIGNUPS);

        $this->assertSame('Table 1', $stats['tables'][0]['name']);
        $this->assertSame(3, $stats['tables'][0]['personCount']);
        $this->assertCount(2, $stats['tables'][0]['signups']);
        $this->assertSame('Table 2', $stats['tables'][1]['name']);
        $this->assertSame(1, $stats['tables'][1]['personCount']);
    }

    public function test_export_rows_start_with_a_french_header(): void
    {
        $rows = SignupStats::exportRows(self::SIGNUPS);

        $this->assertSame(
            ['Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
                'Viande', 'Enfant', 'Végétarien', 'Total'],
            $rows[0]
        );
        $this->assertCount(4, $rows);
    }

    public function test_export_neutralizes_spreadsheet_formula_injection(): void
    {
        $rows = SignupStats::exportRows([
            ['first_name' => '=cmd', 'last_name' => '+x', 'address' => '-y',
                'phone' => '@z', 'email' => 'ok@example.com',
                'table_name' => 'Table', 'menus' => ['meat']],
        ]);

        $this->assertSame("'+x", $rows[1][1]);
        $this->assertSame("'=cmd", $rows[1][2]);
        $this->assertSame("'-y", $rows[1][4]);
        $this->assertSame("'@z", $rows[1][5]);
    }
}

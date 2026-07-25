<?php

namespace App\Support;

/**
 * Aggregation and spreadsheet export for signups.
 *
 * Ported from the old app's App\Repositories\SignupRepository::computeStats(),
 * exportRows(), zeroCounts() and cellSafe(). Behaviour is identical, including
 * the first-seen (not sorted) per-table ordering.
 */
final class SignupStats
{
    /**
     * Aggregate decoded signups into totals + per-table grouping.
     *
     * @param  array<int,array>  $signups  each with table_name + menus(string[]) + contact
     */
    public static function compute(array $signups): array
    {
        $menuTotals = self::zeroCounts();
        $totalPersons = 0;
        $index = [];
        $tables = [];

        foreach ($signups as $s) {
            $counts = self::zeroCounts();
            foreach ($s['menus'] as $m) {
                $counts[$m]++;
                $menuTotals[$m]++;
                $totalPersons++;
            }
            $personCount = count($s['menus']);
            $name = $s['table_name'];
            if (! isset($index[$name])) {
                $index[$name] = count($tables);
                $tables[] = [
                    'name' => $name,
                    'personCount' => 0,
                    'menuCounts' => self::zeroCounts(),
                    'signups' => [],
                ];
            }
            $i = $index[$name];
            $tables[$i]['personCount'] += $personCount;
            foreach (Occasion::MENU_VALUES as $v) {
                $tables[$i]['menuCounts'][$v] += $counts[$v];
            }
            $tables[$i]['signups'][] = [
                'first_name' => $s['first_name'],
                'last_name' => $s['last_name'],
                'address' => $s['address'],
                'phone' => $s['phone'],
                'email' => $s['email'] ?? '',
                'personCount' => $personCount,
                'menuCounts' => $counts,
            ];
        }

        return [
            'totalPersons' => $totalPersons,
            'totalTables' => count($tables),
            'menuTotals' => $menuTotals,
            'tables' => $tables,
        ];
    }

    /**
     * Flat rows for the spreadsheet export: a header row followed by one row
     * per signup with per-menu counts. String fields are neutralized against
     * spreadsheet formula injection.
     *
     * @param  array<int,array>  $signups  each with contact + menus(string[])
     * @return array<int,array>
     */
    public static function exportRows(array $signups): array
    {
        $rows = [[
            'Table', 'Nom', 'Prénom', 'Email', 'Adresse', 'Téléphone',
            'Viande', 'Enfant', 'Végétarien', 'Total',
        ]];
        foreach ($signups as $s) {
            $counts = self::zeroCounts();
            foreach ($s['menus'] as $m) {
                $counts[$m]++;
            }
            $rows[] = [
                self::cellSafe($s['table_name']),
                self::cellSafe($s['last_name']),
                self::cellSafe($s['first_name']),
                self::cellSafe($s['email'] ?? ''),
                self::cellSafe($s['address']),
                self::cellSafe($s['phone']),
                $counts['meat'],
                $counts['child'],
                $counts['vegetarian'],
                count($s['menus']),
            ];
        }

        return $rows;
    }

    /** @return array{meat:int,child:int,vegetarian:int} */
    private static function zeroCounts(): array
    {
        return array_fill_keys(Occasion::MENU_VALUES, 0);
    }

    /**
     * Neutralize spreadsheet formula injection: prefix a leading =, +, -, @
     * (or control chars) with a quote so the cell is treated as text.
     */
    private static function cellSafe(string $value): string
    {
        if ($value !== '' && preg_match('/^[=+\-@\t\r]/', $value) === 1) {
            return "'".$value;
        }

        return $value;
    }
}

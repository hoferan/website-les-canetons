<?php

final class SignupRepository
{
    public const MENU_VALUES = ['meat', 'child', 'vegetarian'];

    public const MENU_LABELS = [
        'meat'       => 'Viande',
        'child'      => 'Enfant',
        'vegetarian' => 'Végétarien',
    ];

    public const MENU_DEFAULT = 'meat';

    public const MAX_GUESTS = 30;

    public const ACTIVE_OCCASION = 'anniversary-supper';

    public const OCCASIONS = [
        'anniversary-supper' => [
            'title'        => 'Souper des 25 ans des Canetons',
            'subtitle'     => 'Sortie du nouveau costume · Soirée guggen',
            'date'         => '2027-11-13',
            'date_display' => '13 novembre 2027',
            'teaser'       => 'Le 13 novembre 2027, fêtez avec nous les 25 ans '
                . 'des Canetons ! Au programme : le dévoilement de notre nouveau '
                . 'costume, un souper d\'anniversaire et une soirée guggen avec '
                . 'des cliques invitées. Amis et familles, réservez votre place '
                . 'et votre menu.',
            'description'  => 'Un grand merci à nos amis et à nos familles ! Le '
                . '13 novembre 2027, nous fêtons nos 25 ans : dévoilement du '
                . 'nouveau costume, souper d\'anniversaire et soirée guggen. '
                . 'Inscrivez-vous ci-dessous pour réserver votre place et votre '
                . 'menu.',
        ],
    ];

    public function __construct(private mysqli $db)
    {
    }

    /**
     * Validate a raw menus value from client input.
     *
     * @param mixed $raw
     * @return string[]|null clean list of menu values, or null if invalid
     */
    public static function normalizeMenus($raw): ?array
    {
        if (!is_array($raw)) {
            return null;
        }
        $menus = [];
        foreach ($raw as $item) {
            if (!is_string($item) || !in_array($item, self::MENU_VALUES, true)) {
                return null;
            }
            $menus[] = $item;
        }
        $count = count($menus);
        if ($count < 1 || $count > self::MAX_GUESTS) {
            return null;
        }
        return $menus;
    }

    /**
     * Aggregate decoded signups into totals + per-table grouping.
     *
     * @param array<int,array> $signups each with table_name + menus(string[]) + contact
     * @return array
     */
    public static function computeStats(array $signups): array
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
            if (!isset($index[$name])) {
                $index[$name] = count($tables);
                $tables[] = [
                    'name'        => $name,
                    'personCount' => 0,
                    'menuCounts'  => self::zeroCounts(),
                    'signups'     => [],
                ];
            }
            $i = $index[$name];
            $tables[$i]['personCount'] += $personCount;
            foreach (self::MENU_VALUES as $v) {
                $tables[$i]['menuCounts'][$v] += $counts[$v];
            }
            $tables[$i]['signups'][] = [
                'first_name'  => $s['first_name'],
                'last_name'   => $s['last_name'],
                'address'     => $s['address'],
                'phone'       => $s['phone'],
                'personCount' => $personCount,
                'menuCounts'  => $counts,
            ];
        }

        return [
            'totalPersons' => $totalPersons,
            'totalTables'  => count($tables),
            'menuTotals'   => $menuTotals,
            'tables'       => $tables,
        ];
    }

    /** @return array{meat:int,child:int,vegetarian:int} */
    private static function zeroCounts(): array
    {
        return ['meat' => 0, 'child' => 0, 'vegetarian' => 0];
    }

    /** Insert one signup. $data['menus'] is a string[]. */
    public function create(array $data): void
    {
        $sql = 'INSERT INTO signups
                (occasion, first_name, last_name, address, phone, table_name, menus)
                VALUES (?, ?, ?, ?, ?, ?, ?)';
        $stmt = $this->db->prepare($sql);
        $menusJson = json_encode(array_values($data['menus']));
        $stmt->bind_param(
            'sssssss',
            $data['occasion'],
            $data['first_name'],
            $data['last_name'],
            $data['address'],
            $data['phone'],
            $data['table_name'],
            $menusJson
        );
        $stmt->execute();
        $stmt->close();
    }

    /** @return string[] distinct table names for the datalist. */
    public function distinctTables(string $occasion): array
    {
        $stmt = $this->db->prepare(
            'SELECT DISTINCT table_name FROM signups WHERE occasion = ? ORDER BY table_name'
        );
        $stmt->bind_param('s', $occasion);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return array_map(static fn(array $r): string => $r['table_name'], $rows);
    }

    /**
     * All signups for an occasion, menus decoded, ordered by table then id.
     *
     * @return array<int,array>
     */
    public function allForOccasion(string $occasion): array
    {
        $stmt = $this->db->prepare(
            'SELECT first_name, last_name, address, phone, table_name, menus
             FROM signups WHERE occasion = ? ORDER BY table_name, id'
        );
        $stmt->bind_param('s', $occasion);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return array_map(static function (array $r): array {
            $r['menus'] = json_decode($r['menus'], true) ?: [];
            return $r;
        }, $rows);
    }
}

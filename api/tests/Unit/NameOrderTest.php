<?php

namespace Tests\Unit;

use App\Support\NameOrder;
use PHPUnit\Framework\TestCase;

class NameOrderTest extends TestCase
{
    public function test_accents_and_case_do_not_push_a_name_to_the_end(): void
    {
        // A byte order puts "de Weck" and "égger" after "Zbinden", which is
        // where nobody at the till would look for them.
        $names = ['Zbinden', 'égger', 'de Weck', 'Aebischer'];

        usort($names, NameOrder::compare(...));

        $this->assertSame(['Aebischer', 'de Weck', 'égger', 'Zbinden'], $names);
    }

    public function test_numbered_tables_come_in_number_order(): void
    {
        // Tables are often numbered; a plan reading 1, 10, 11, 2 is wrong.
        $tables = ['Table 10', 'Table 2', 'Table 1'];

        usort($tables, NameOrder::compare(...));

        $this->assertSame(['Table 1', 'Table 2', 'Table 10'], $tables);
    }
}

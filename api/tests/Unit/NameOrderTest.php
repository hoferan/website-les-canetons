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
}

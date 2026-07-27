<?php

namespace Tests\Unit;

use App\Support\Occasion;
use PHPUnit\Framework\TestCase;

class OccasionTest extends TestCase
{
    public function test_the_active_occasion_is_resolvable(): void
    {
        $this->assertSame('Souper des 25 ans des Canetons', Occasion::active()['title']);
    }

    public function test_valid_menus_are_returned_unchanged(): void
    {
        $this->assertSame(['meat', 'child'], Occasion::normalizeMenus(['meat', 'child']));
    }

    public function test_a_non_array_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus('meat'));
        $this->assertNull(Occasion::normalizeMenus(null));
    }

    public function test_an_unknown_menu_value_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus(['meat', 'lobster']));
    }

    public function test_an_empty_list_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus([]));
    }

    public function test_more_than_the_guest_cap_is_rejected(): void
    {
        $this->assertNull(Occasion::normalizeMenus(array_fill(0, 31, 'meat')));
        $this->assertNotNull(Occasion::normalizeMenus(array_fill(0, 30, 'meat')));
    }
}

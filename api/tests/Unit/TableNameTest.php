<?php

namespace Tests\Unit;

use App\Support\TableName;
use PHPUnit\Framework\TestCase;

class TableNameTest extends TestCase
{
    public function test_a_table_is_its_trimmed_name(): void
    {
        $this->assertSame('Müller', TableName::key('  Müller '));
    }

    public function test_case_is_kept_so_two_spellings_stay_two_tables(): void
    {
        $this->assertSame('müller', TableName::key('müller'));
    }

    public function test_a_blank_or_missing_name_is_no_table(): void
    {
        $this->assertNull(TableName::key('   '));
        $this->assertNull(TableName::key(null));
    }
}

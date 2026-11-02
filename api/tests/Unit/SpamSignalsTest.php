<?php

namespace Tests\Unit;

use App\Support\SpamSignals;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class SpamSignalsTest extends TestCase
{
    /** @return array<string, array{string}> */
    public static function links(): array
    {
        return [
            'http' => ['see http://x.example'],
            'https in capitals' => ['HTTPS://x.example'],
            'www' => ['www.x.ch'],
            'markup' => ['<b>cheap</b>'],
            'bbcode' => ['[url=x.example]x[/url]'],
            'bbcode in capitals' => ['[URL]x[/URL]'],
        ];
    }

    #[DataProvider('links')]
    public function test_a_link_or_markup_flags_its_field(string $value): void
    {
        $this->assertSame(['message'], SpamSignals::suspectFields(['message' => $value]));
    }

    /** @return array<string, array{?string}> */
    public static function ordinary(): array
    {
        return [
            'a family table' => ['Famille Müller'],
            'an apostrophe' => ["L'amicale"],
            'a comparison' => ['3 > 2'],
            'a dotted name' => ['Ch. www'],
            'empty' => [''],
            'missing' => [null],
        ];
    }

    #[DataProvider('ordinary')]
    public function test_ordinary_text_flags_nothing(?string $value): void
    {
        $this->assertSame([], SpamSignals::suspectFields(['tableName' => $value]));
    }

    public function test_only_the_fields_that_carry_one_are_named_in_the_order_given(): void
    {
        $this->assertSame(
            ['lastName', 'tableName'],
            SpamSignals::suspectFields([
                'firstName' => 'Anna',
                'lastName' => '<a href>',
                'address' => 'Rue du Pont 1',
                'tableName' => 'www.cheap.example',
            ]),
        );
    }
}

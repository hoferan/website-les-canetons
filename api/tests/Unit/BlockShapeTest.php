<?php

namespace Tests\Unit;

use App\Support\BlockShape;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class BlockShapeTest extends TestCase
{
    /** @return array<string, array{mixed, ?string}> */
    public static function cases(): array
    {
        $nest = function (int $levels): array {
            $data = ['leaf' => 'x'];
            for ($i = 1; $i < $levels; $i++) {
                $data = ['n' => $data];
            }

            return $data;
        };

        $large = [];
        for ($i = 0; $i < 24; $i++) {
            $large['k'.$i] = array_fill(0, 24, str_repeat('a', 1999));
        }

        return [
            'empty object' => [[], null],
            'depth 6' => [$nest(6), null],
            'depth 7' => [$nest(7), BlockShape::TOO_DEEP],
            '24 items' => [['items' => array_fill(0, 24, 'x')], null],
            '25 items' => [['items' => array_fill(0, 25, 'x')], BlockShape::TOO_MANY],
            '2000 chars' => [['t' => str_repeat('a', 2000)], null],
            '2001 chars' => [['t' => str_repeat('a', 2001)], BlockShape::TOO_LONG],
            'empty string kept' => [['t' => ''], null],
            'key starting with a digit' => [['1x' => 'x'], BlockShape::BAD_KEY],
            'key with a space, nested' => [['cards' => [['a b' => 'x']]], BlockShape::BAD_KEY],
            'key of 33 characters' => [[str_repeat('a', 33) => 'x'], BlockShape::BAD_KEY],
            'over 64 KB' => [$large, BlockShape::TOO_LARGE],
            'a list' => [['a', 'b'], BlockShape::NOT_AN_OBJECT],
            'a string' => ['text', BlockShape::NOT_AN_OBJECT],
        ];
    }

    #[DataProvider('cases')]
    public function test_check_names_the_first_problem(mixed $data, ?string $expected): void
    {
        $this->assertSame($expected, BlockShape::check($data));
    }
}

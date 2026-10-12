<?php

namespace Tests\Unit;

use App\Support\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * #129: a guest's number in E.164 when it can be read as one, and null when it
 * cannot. Null is always safe: the number as typed is still stored and shown.
 */
class PhoneNumberTest extends TestCase
{
    /** @return array<string, array{string, string}> */
    public static function readable(): array
    {
        return [
            'a Swiss mobile, spaced' => ['079 123 45 67', '+41791234567'],
            'the same with slashes and dots' => ['079/123.45.67', '+41791234567'],
            'already international' => ['+41 79 123 45 67', '+41791234567'],
            'with 00 instead of +' => ['0041 79 123 45 67', '+41791234567'],
            // The known limitation telHref() leaves in place: the trunk prefix
            // in brackets is dropped here, as it must be when dialling from
            // abroad.
            'a trunk prefix in brackets' => ['+41 (0)79 123 45 67', '+41791234567'],
            'a Fribourg landline' => ['026 322 11 22', '+41263221122'],
            'a French mobile written internationally' => ['+33 6 12 34 56 78', '+33612345678'],
            'surrounding spaces' => ['  079 123 45 67 ', '+41791234567'],
        ];
    }

    #[DataProvider('readable')]
    public function test_a_readable_number_becomes_e164(string $typed, string $e164): void
    {
        $this->assertSame($e164, PhoneNumber::e164($typed));
    }

    /** @return array<string, array{string}> */
    public static function unreadable(): array
    {
        return [
            // Prose means "read the field", as in telHref(): a number with an
            // extension or a note in words is not one thing to dial.
            'a note in words' => ['079 123 45 67 (privé)'],
            'an extension' => ['079 123 45 67 p. 12'],
            // The library reads these three as a number and would hand back
            // a dial string: the extension dropped, or a letter O dialled as
            // a digit. The letter rule is what refuses them.
            'an extension the library would drop' => ['079 123 45 67 ext 12'],
            'an x extension' => ['079 123 45 67 x12'],
            'a letter O typed for a zero' => ['O79 123 45 67'],
            'no number at all' => ['à demander'],
            'too short' => ['1234'],
            'not a valid Swiss number' => ['079 123'],
            'two numbers' => ['079 123 45 67 / 026 322 11 22'],
            'a plus in the middle' => ['079+123 45 67'],
            'empty' => [''],
        ];
    }

    #[DataProvider('unreadable')]
    public function test_anything_else_is_null(string $typed): void
    {
        $this->assertNull(PhoneNumber::e164($typed));
    }
}

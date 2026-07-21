<?php

use App\Validation\Validator;
use App\Validation\{Required, TypeString, MaxLength, EmailFormat, OneOf, PositiveInt};
use PHPUnit\Framework\TestCase;

final class RequiredFixture
{
    public function __construct(#[Required] public readonly mixed $name)
    {
    }
}

final class TypeStringFixture
{
    public function __construct(#[TypeString] public readonly mixed $note)
    {
    }
}

final class MaxLengthFixture
{
    public function __construct(#[TypeString, MaxLength(5)] public readonly mixed $code)
    {
    }
}

final class EmailFormatFixture
{
    public function __construct(#[Required, EmailFormat] public readonly mixed $email)
    {
    }
}

final class OneOfFixture
{
    public function __construct(#[OneOf(['a', 'b'])] public readonly mixed $choice)
    {
    }
}

final class PositiveIntFixture
{
    public function __construct(#[PositiveInt] public readonly mixed $id)
    {
    }
}

final class MultiFieldFixture
{
    public function __construct(
        #[Required] public readonly mixed $first,
        #[Required] public readonly mixed $second,
    ) {
    }
}

final class ValidatorTest extends TestCase
{
    public function testRequiredPassesForNonEmptyString(): void
    {
        $this->assertSame([], Validator::validate(new RequiredFixture('hello')));
    }

    public function testRequiredFailsForMissingValue(): void
    {
        $this->assertSame(
            [['field' => 'name', 'reason' => 'required']],
            Validator::validate(new RequiredFixture(null))
        );
    }

    public function testRequiredFailsForEmptyOrWhitespaceString(): void
    {
        $this->assertSame(
            [['field' => 'name', 'reason' => 'required']],
            Validator::validate(new RequiredFixture('   '))
        );
    }

    public function testRequiredFailsWithInvalidTypeForNonScalarPresentValue(): void
    {
        $this->assertSame(
            [['field' => 'name', 'reason' => 'invalid_type']],
            Validator::validate(new RequiredFixture(['not', 'a', 'string']))
        );
    }

    public function testTypeStringPassesWhenAbsent(): void
    {
        $this->assertSame([], Validator::validate(new TypeStringFixture(null)));
    }

    public function testTypeStringFailsForNonString(): void
    {
        $this->assertSame(
            [['field' => 'note', 'reason' => 'invalid_type']],
            Validator::validate(new TypeStringFixture(42))
        );
    }

    public function testMaxLengthPassesUnderLimit(): void
    {
        $this->assertSame([], Validator::validate(new MaxLengthFixture('abc')));
    }

    public function testMaxLengthFailsOverLimitWithParams(): void
    {
        $this->assertSame(
            [['field' => 'code', 'reason' => 'too_long', 'params' => ['max' => 5]]],
            Validator::validate(new MaxLengthFixture('abcdef'))
        );
    }

    public function testMaxLengthStopsAtTypeStringFailureFirst(): void
    {
        // Wrong type: TypeString fails first, MaxLength never runs (only one error reported).
        $this->assertSame(
            [['field' => 'code', 'reason' => 'invalid_type']],
            Validator::validate(new MaxLengthFixture(12345678))
        );
    }

    public function testEmailFormatPassesForValidAddress(): void
    {
        $this->assertSame([], Validator::validate(new EmailFormatFixture('a@example.com')));
    }

    public function testEmailFormatFailsForInvalidAddress(): void
    {
        $this->assertSame(
            [['field' => 'email', 'reason' => 'invalid_format']],
            Validator::validate(new EmailFormatFixture('not-an-email'))
        );
    }

    public function testOneOfPassesForAllowedValue(): void
    {
        $this->assertSame([], Validator::validate(new OneOfFixture('a')));
    }

    public function testOneOfFailsWithParamsForDisallowedValue(): void
    {
        $this->assertSame(
            [['field' => 'choice', 'reason' => 'invalid_value', 'params' => ['allowed' => ['a', 'b']]]],
            Validator::validate(new OneOfFixture('c'))
        );
    }

    public function testPositiveIntPassesForPositiveNumericString(): void
    {
        $this->assertSame([], Validator::validate(new PositiveIntFixture('5')));
    }

    public function testPositiveIntFailsForMissingValue(): void
    {
        $this->assertSame(
            [['field' => 'id', 'reason' => 'required']],
            Validator::validate(new PositiveIntFixture(null))
        );
    }

    public function testPositiveIntFailsForZeroOrNegative(): void
    {
        $this->assertSame(
            [['field' => 'id', 'reason' => 'invalid_value']],
            Validator::validate(new PositiveIntFixture(0))
        );
    }

    public function testCollectsFailuresFromEveryField(): void
    {
        $this->assertSame(
            [
                ['field' => 'first', 'reason' => 'required'],
                ['field' => 'second', 'reason' => 'required'],
            ],
            Validator::validate(new MultiFieldFixture(null, null))
        );
    }
}

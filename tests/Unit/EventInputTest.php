<?php

use App\Dto\EventInput;
use App\Validation\Validator;
use PHPUnit\Framework\TestCase;

final class EventInputTest extends TestCase
{
    /** Build an EventInput with valid defaults, overriding only the given fields. */
    private static function make(array $overrides = []): EventInput
    {
        $o = $overrides + [
            'date' => '2026-08-01',
            'title' => 'Titre',
            'startTime' => '10:00:00',
            'endTime' => '11:00:00',
            'location' => 'Lieu',
            'attire' => 'Costume',
            'weekend' => false,
        ];
        return new EventInput(
            $o['date'],
            $o['title'],
            $o['startTime'],
            $o['endTime'],
            $o['location'],
            $o['attire'],
            $o['weekend'],
        );
    }

    public function testValidInputPasses(): void
    {
        $this->assertSame([], Validator::validate(self::make()));
    }

    public function testMissingRequiredFieldsAreReported(): void
    {
        $this->assertSame(
            [
                ['field' => 'date', 'reason' => 'required'],
                ['field' => 'title', 'reason' => 'required'],
                ['field' => 'startTime', 'reason' => 'required'],
                ['field' => 'endTime', 'reason' => 'required'],
                ['field' => 'location', 'reason' => 'required'],
            ],
            Validator::validate(self::make([
                'date' => null,
                'title' => null,
                'startTime' => null,
                'endTime' => null,
                'location' => null,
            ]))
        );
    }

    public function testOversizedTitleIsTooLong(): void
    {
        // title is a varchar(255) column; an over-limit value must be caught
        // as a validation error, not passed through to the DB (which would
        // raise an uncaught exception and a non-JSON 500 response).
        $this->assertSame(
            [['field' => 'title', 'reason' => 'too_long', 'params' => ['max' => 255]]],
            Validator::validate(self::make(['title' => str_repeat('a', 256)]))
        );
    }

    public function testOversizedLocationIsTooLong(): void
    {
        $this->assertSame(
            [['field' => 'location', 'reason' => 'too_long', 'params' => ['max' => 255]]],
            Validator::validate(self::make(['location' => str_repeat('a', 256)]))
        );
    }

    public function testOversizedAttireIsTooLong(): void
    {
        $this->assertSame(
            [['field' => 'attire', 'reason' => 'too_long', 'params' => ['max' => 255]]],
            Validator::validate(self::make(['attire' => str_repeat('a', 256)]))
        );
    }
}

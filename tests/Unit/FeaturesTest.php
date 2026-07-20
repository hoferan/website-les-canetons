<?php

use App\Features;
use PHPUnit\Framework\TestCase;

final class FeaturesTest extends TestCase
{
    public function testEnabledFlagReturnsTrue(): void
    {
        Features::init(['souper_signup' => true]);
        $this->assertTrue(Features::enabled('souper_signup'));
    }

    public function testDisabledFlagReturnsFalse(): void
    {
        Features::init(['souper_signup' => false]);
        $this->assertFalse(Features::enabled('souper_signup'));
    }

    public function testUnknownFlagDefaultsToDisabled(): void
    {
        Features::init(['souper_signup' => true]);
        $this->assertFalse(Features::enabled('some_other_flag'));
    }

    public function testEmptyConfigDisablesEverything(): void
    {
        Features::init([]);
        $this->assertFalse(Features::enabled('souper_signup'));
    }

    public function testNonBooleanValuesAreCastToBool(): void
    {
        Features::init(['souper_signup' => 1]);
        $this->assertTrue(Features::enabled('souper_signup'));

        Features::init(['souper_signup' => 0]);
        $this->assertFalse(Features::enabled('souper_signup'));
    }
}

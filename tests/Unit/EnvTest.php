<?php

use App\Env;
use PHPUnit\Framework\TestCase;

final class EnvTest extends TestCase
{
    public function testTestEnvironmentHasTestRibbonAndIsNotProd(): void
    {
        Env::init('test');
        $this->assertSame('test', Env::current());
        $this->assertFalse(Env::isProd());
        $this->assertSame('TEST', Env::ribbonLabel());
    }

    public function testQaEnvironmentHasQaRibbon(): void
    {
        Env::init('qa');
        $this->assertSame('qa', Env::current());
        $this->assertFalse(Env::isProd());
        $this->assertSame('QA', Env::ribbonLabel());
    }

    public function testDevEnvironmentHasDevRibbon(): void
    {
        Env::init('dev');
        $this->assertSame('dev', Env::current());
        $this->assertFalse(Env::isProd());
        $this->assertSame('DEV', Env::ribbonLabel());
    }

    public function testProdEnvironmentHasNoRibbon(): void
    {
        Env::init('prod');
        $this->assertSame('prod', Env::current());
        $this->assertTrue(Env::isProd());
        $this->assertNull(Env::ribbonLabel());
    }

    public function testNullEnvironmentDefaultsToProd(): void
    {
        Env::init(null);
        $this->assertSame('prod', Env::current());
        $this->assertTrue(Env::isProd());
        $this->assertNull(Env::ribbonLabel());
    }

    public function testUnknownEnvironmentDefaultsToProd(): void
    {
        Env::init('staging-something');
        $this->assertSame('prod', Env::current());
        $this->assertTrue(Env::isProd());
    }

    public function testEnvironmentValueIsCaseInsensitive(): void
    {
        Env::init('TEST');
        $this->assertSame('test', Env::current());
        $this->assertSame('TEST', Env::ribbonLabel());
    }
}

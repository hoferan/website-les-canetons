<?php

use App\Env;
use PHPUnit\Framework\TestCase;

final class EnvBannerTest extends TestCase
{
    private function render(): string
    {
        ob_start();
        require __DIR__ . '/../../app/partials/env_banner.php';
        return trim((string) ob_get_clean());
    }

    public function testTestEnvironmentRendersTestRibbon(): void
    {
        Env::init('test');
        $html = $this->render();
        $this->assertStringContainsString('env-ribbon', $html);
        $this->assertStringContainsString('env-ribbon-test', $html);
        $this->assertStringContainsString('TEST', $html);
    }

    public function testQaEnvironmentRendersQaRibbon(): void
    {
        Env::init('qa');
        $html = $this->render();
        $this->assertStringContainsString('env-ribbon-qa', $html);
        $this->assertStringContainsString('QA', $html);
    }

    public function testDevEnvironmentRendersDevRibbon(): void
    {
        Env::init('dev');
        $html = $this->render();
        $this->assertStringContainsString('env-ribbon-dev', $html);
        $this->assertStringContainsString('DEV', $html);
    }

    public function testProdEnvironmentRendersNothing(): void
    {
        Env::init('prod');
        $this->assertSame('', $this->render());
    }
}

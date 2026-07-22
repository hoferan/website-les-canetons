<?php

use App\Env;
use App\Features;
use PHPUnit\Framework\TestCase;

final class ViewTest extends TestCase
{
    protected function setUp(): void
    {
        Env::init('prod');
        Features::init([]);
        $_SESSION = [];
    }

    protected function tearDown(): void
    {
        Env::init('prod');
        Features::init([]);
        $_SESSION = [];
    }

    private function render(string $template, string $currentRoute = '404'): string
    {
        ob_start();
        \App\View::renderPage($template, 'Test Title', 'test.css', [], $currentRoute);
        return (string) ob_get_clean();
    }

    public function testPageTitleAndCssRender(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('<title>Test Title</title>', $html);
        $this->assertStringContainsString('assets/css/test.css', $html);
    }

    public function testSessionRoleNullWhenLoggedOut(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('window.__sessionRole = null;', $html);
    }

    public function testSessionRoleReflectsLoggedInUser(): void
    {
        $_SESSION['user'] = ['username' => 'demo.admin', 'role' => 'admin'];
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('window.__sessionRole = "admin";', $html);
    }

    public function testProdEnvironmentRendersNoRibbon(): void
    {
        Env::init('prod');
        $html = $this->render('404.html.twig');
        $this->assertStringNotContainsString('env-ribbon', $html);
    }

    public function testTestEnvironmentRendersTestRibbon(): void
    {
        Env::init('test');
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('env-ribbon-test', $html);
        $this->assertStringContainsString('TEST', $html);
    }

    public function testFourOhFourContentRenders(): void
    {
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('Page introuvable', $html);
        $this->assertStringContainsString('Retour', $html);
    }

    public function testNoNavItemIsActiveForFourOhFourRoute(): void
    {
        $html = $this->render('404.html.twig', '404');
        $this->assertStringNotContainsString('class="active"', $html);
    }

    public function testSignupPopupHiddenWhenFeatureDisabled(): void
    {
        Features::init(['souper_signup' => false]);
        $html = $this->render('404.html.twig');
        $this->assertStringNotContainsString('supper-popup', $html);
    }

    public function testSignupPopupRendersForGuestWhenFeatureEnabled(): void
    {
        Features::init(['souper_signup' => true]);
        $html = $this->render('404.html.twig');
        $this->assertStringContainsString('id="supper-popup"', $html);
        $this->assertStringContainsString('Souper des 25 ans des Canetons', $html);
    }

    public function testSignupPopupHiddenForAdminEvenWhenFeatureEnabled(): void
    {
        Features::init(['souper_signup' => true]);
        $_SESSION['user'] = ['username' => 'demo.admin', 'role' => 'admin'];
        $html = $this->render('404.html.twig');
        $this->assertStringNotContainsString('supper-popup', $html);
    }
}

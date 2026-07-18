<?php

use FastRoute\Dispatcher;
use PHPUnit\Framework\TestCase;

use function FastRoute\simpleDispatcher;

final class RoutesTest extends TestCase
{
    private static Dispatcher $dispatcher;

    public static function setUpBeforeClass(): void
    {
        // routes.php returns the route-definition closure; require it once
        // (a second require of the same file would return true, not the closure).
        self::$dispatcher = simpleDispatcher(require dirname(__DIR__, 2) . '/app/src/routes.php');
    }

    public function testHomepageRouteResolves(): void
    {
        $info = self::$dispatcher->dispatch('GET', '/');
        $this->assertSame(Dispatcher::FOUND, $info[0]);
    }

    public function testLegacyIndexPhpRedirectResolves(): void
    {
        $info = self::$dispatcher->dispatch('GET', '/index.php');
        $this->assertSame(Dispatcher::FOUND, $info[0]);
    }

    public function testLegacyAccueilPhpRedirectResolves(): void
    {
        // /accueil.html -> (mod_alias) /accueil.php -> (this route) / : the old
        // homepage's legacy URL must not dead-end at a 404.
        $info = self::$dispatcher->dispatch('GET', '/accueil.php');
        $this->assertSame(Dispatcher::FOUND, $info[0]);
    }
}

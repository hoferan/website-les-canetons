<?php

use App\Features;
use FastRoute\Dispatcher;
use PHPUnit\Framework\TestCase;

use function FastRoute\simpleDispatcher;

final class RoutesTest extends TestCase
{
    private static Dispatcher $dispatcher;

    public static function setUpBeforeClass(): void
    {
        // Every flag-gated route registered, so testNoApiRoutesAreRegistered
        // covers `signups`/`altcha` too — with the flag off (the default for an
        // uninitialised Features) those two would report absent for the wrong
        // reason. FeaturesTest re-inits the flag in each of its own tests, so
        // leaving this set cannot leak into it.
        Features::init(['souper_signup' => true]);

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

    /**
     * The old app must register NO /api/* route. Apache dispatches /api/* (and
     * /sanctum/*) into api-laravel/ before the front controller is ever reached
     * — see app/.htaccess — so any route here would be dead code at best. At
     * worst a future .htaccess edit that lets one through would silently
     * resurrect a deleted handler, so this asserts absence rather than merely
     * not asserting presence.
     *
     * Both URL shapes the removed loop generated are checked: the clean route
     * and the legacy `.php` 301.
     *
     * @return list<array{0: string}>
     */
    public static function apiEndpointNames(): array
    {
        return [
            ['contact'],
            ['signups'],
            ['altcha'],
            ['events'],
            ['responses'],
            ['login'],
            ['logout'],
            ['migrate'],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('apiEndpointNames')]
    public function testNoApiRoutesAreRegistered(string $name): void
    {
        foreach (['GET', 'POST', 'PUT', 'DELETE'] as $method) {
            foreach (['/api/' . $name, '/api/' . $name . '.php'] as $path) {
                $info = self::$dispatcher->dispatch($method, $path);
                $this->assertSame(
                    Dispatcher::NOT_FOUND,
                    $info[0],
                    $method . ' ' . $path . ' must not be routed by the old app'
                );
            }
        }
    }
}

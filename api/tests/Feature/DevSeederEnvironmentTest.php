<?php

namespace Tests\Feature;

use App\Models\Member;
use Database\Seeders\DevSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The demo accounts share one known password, so the seeder runs only where
 * that is harmless. A server's APP_ENV is `test`, `qa` or `production`, and
 * none of them may get a demo login, whatever calls db:seed there.
 */
class DevSeederEnvironmentTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<string, array{string}> */
    public static function serverEnvironments(): array
    {
        return [
            'test' => ['test'],
            'qa' => ['qa'],
            'production' => ['production'],
            'an unknown name' => ['staging'],
        ];
    }

    #[DataProvider('serverEnvironments')]
    public function test_it_seeds_nothing_on_a_server(string $environment): void
    {
        $this->app['env'] = $environment;

        // The seeder itself, not db:seed: on production that command stops to
        // ask for confirmation, which would test the prompt instead of the guard.
        $this->app->make(DevSeeder::class)->run();

        $this->assertSame(0, Member::where('username', 'like', 'demo.%')->count());
    }

    public function test_it_seeds_the_local_stack(): void
    {
        $this->app['env'] = 'local';

        $this->seed(DevSeeder::class);

        $this->assertSame(5, Member::where('username', 'like', 'demo.%')->count());
    }
}

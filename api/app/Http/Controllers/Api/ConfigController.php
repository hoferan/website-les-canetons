<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Environment;
use App\Support\Features;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;

#[Group('Service', 'What a client needs before it renders anything.', weight: 70)]
class ConfigController extends Controller
{
    /**
     * Read the runtime configuration.
     *
     * Anonymous, and no session is required. The SPA fetches this before its
     * first render to learn which environment it is talking to and which
     * feature flags are on.
     *
     * Returns `env`, one of `dev`, `test`, `qa` or `prod`, and `features`, a
     * map of flag name to boolean. A flag the server says nothing about
     * reads as `false`, and an environment the server does not recognise
     * reads as `prod`.
     *
     * Carries no secrets and depends on nothing about the caller. The
     * response is `no-store`, so a value changed on the server is picked up
     * on the next page load.
     */
    #[Response(200, 'The environment this API is running as, and which feature flags are on.')]
    #[Endpoint(operationId: 'config.show')]
    public function __invoke(): JsonResponse
    {
        // The front end is one static bundle promoted unchanged from TEST to
        // QA to PROD, so anything environment-specific arrives here at
        // runtime (ADR 0007).
        //
        // Public and unauthenticated, so every value below is an explicit
        // choice. Never return config() wholesale: it carries database and
        // mail secrets. App\Support\Features does the same for the flags,
        // whose key set is fixed in code and never read from the environment.
        $body = [
            'env' => $this->env(),
            'features' => Features::all(),
        ];

        return response()->json($body)->header('Cache-Control', 'no-store');
    }

    /**
     * App\Support\Environment owns the APP_ENV translation and its fail-safe:
     * anything unrecognised collapses to 'prod', so a misspelled APP_ENV
     * cannot paint a staging ribbon on the live site. The API reference's
     * server label uses it too, so the two always agree.
     *
     * Returns the enum rather than its value. The JSON is identical, but the
     * contract gains the closed set and the generated client a union of four
     * strings instead of `string`.
     */
    private function env(): Environment
    {
        return Environment::current();
    }
}

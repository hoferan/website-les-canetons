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
        // WHY THIS EXISTS. The front end is a static bundle promoted
        // unchanged from TEST to QA to PROD, so nothing environment-specific
        // may be compiled into it — baking values in at build time would mean
        // one build per environment and would break tag-based promotion.
        // Everything the old app rendered from config.php therefore arrives
        // here at runtime.
        //
        // PUBLIC AND UNAUTHENTICATED, so every value below is an explicit,
        // reviewed choice. Never return config() wholesale: this response is
        // world-readable and the same config carries database and mail
        // secrets. App\Support\Features holds the same line for the flags —
        // the key set is fixed in code, never read from the environment.
        $body = [
            'env' => $this->env(),
            'features' => Features::all(),
        ];

        return response()->json($body)->header('Cache-Control', 'no-store');
    }

    /**
     * Delegated to App\Support\Environment, which owns the APP_ENV
     * translation and its fail-safe (anything unrecognised collapses to
     * 'prod', so a misspelled APP_ENV can never paint a staging ribbon on the
     * live site). Shared with the API reference's server label so the two
     * cannot disagree about which environment this is.
     *
     * Returns the ENUM, not its value. The JSON is identical — a backed enum
     * encodes as its value — but the contract gains the closed set, and a
     * generated client gains a union of four strings rather than `string` for
     * the field the SPA switches its whole chrome on.
     */
    private function env(): Environment
    {
        return Environment::current();
    }
}

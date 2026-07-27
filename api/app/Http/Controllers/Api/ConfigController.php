<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Occasion;
use Illuminate\Http\JsonResponse;

/**
 * Runtime configuration for the SPA.
 *
 * WHY THIS EXISTS. The front end is a static bundle promoted unchanged from TEST
 * to QA to PROD, so nothing environment-specific may be compiled into it —
 * baking values in at build time would mean one build per environment and would
 * break tag-based promotion. Everything the old app rendered from config.php
 * therefore arrives here at runtime.
 *
 * PUBLIC AND UNAUTHENTICATED, so every value below is an explicit, reviewed
 * choice. Never return config() wholesale: this response is world-readable and
 * the same config carries database, mail and Altcha secrets.
 */
class ConfigController extends Controller
{
    /** Non-prod environments, mirroring the old App\Env::RIBBONS. */
    private const NON_PROD = ['dev', 'test', 'qa'];

    public function __invoke(): JsonResponse
    {
        // config('app.souper_signup_enabled'), NOT a features.* key: the flag
        // lives in api/config/app.php, fed by SOUPER_SIGNUP_ENABLED, and
        // App\Http\Middleware\EnsureSouperSignupEnabled reads that same key.
        // The RESPONSE key stays features.souper_signup — the client-facing
        // name, matching the old app's $config['features']['souper_signup'].
        $enabled = (bool) config('app.souper_signup_enabled');

        return response()->json([
            'env' => $this->env(),
            'features' => [
                'souper_signup' => $enabled,
            ],
            // Null when the feature is off, so a server with the feature
            // disabled publishes no copy about an unannounced event — matching
            // the old app, where those routes did not exist at all.
            'occasion' => $enabled ? $this->occasion() : null,
        ])->header('Cache-Control', 'no-store');
    }

    /**
     * Anything that is not a known non-prod environment collapses to 'prod',
     * copying App\Env's fail-safe: a missing or misspelled APP_ENV must never
     * paint a staging ribbon on the live site.
     */
    private function env(): string
    {
        $env = strtolower(trim((string) config('app.env')));

        return in_array($env, self::NON_PROD, true) ? $env : 'prod';
    }

    /**
     * The active occasion, flattened for the client: menus become a list of
     * {value, label, description, price} rather than four parallel maps, so the
     * form can render them in one pass.
     *
     * `price` is a pre-formatted French display string ('CHF 45.–'), not a
     * number — currency formatting stays server-side, beside the description it
     * belongs with.
     *
     * @return array<string,mixed>
     */
    private function occasion(): array
    {
        $occasion = Occasion::active();

        return [
            'title' => $occasion['title'],
            'subtitle' => $occasion['subtitle'],
            'date' => $occasion['date'],
            'dateDisplay' => $occasion['date_display'],
            'teaser' => $occasion['teaser'],
            'invitation' => $occasion['invitation'],
            'maxGuests' => Occasion::MAX_GUESTS,
            'menus' => array_map(
                static fn (string $value): array => [
                    'value' => $value,
                    'label' => Occasion::MENU_LABELS[$value],
                    'description' => Occasion::MENU_INFO[$value]['description'] ?? '',
                    'price' => Occasion::MENU_INFO[$value]['price'] ?? '',
                ],
                Occasion::MENU_VALUES
            ),
        ];
    }
}

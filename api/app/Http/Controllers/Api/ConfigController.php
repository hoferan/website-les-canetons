<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\Occasion;
use Illuminate\Http\JsonResponse;
use RuntimeException;

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
    /**
     * Translates Laravel's APP_ENV vocabulary into the ribbon vocabulary the
     * old App\Env (and this response) speaks.
     *
     * The two vocabularies differ for a real reason, not by accident: Laravel
     * itself uses `local`/`production` by convention (and other code keys off
     * that — e.g. Scramble's RestrictedDocsAccess middleware gates the API
     * docs UI on app()->environment('local')), whereas the ribbon vocabulary
     * (`dev`/`test`/`qa`, prod = no ribbon) came from the old App\Env and is
     * what servers set APP_ENV to by hand on TEST/QA/PROD. So `local` (Docker
     * dev) maps onto `dev` here rather than renaming APP_ENV to match — doing
     * the latter would break the Laravel-idiomatic behaviour that depends on
     * the literal string `local`.
     *
     * Anything not listed here (including Laravel's idiomatic `production`,
     * listed explicitly so a future edit to this map cannot silently break it)
     * falls through to the default branch below, which is 'prod'.
     */
    private const ENV_MAP = [
        'local' => 'dev',
        'dev' => 'dev',
        'test' => 'test',
        'qa' => 'qa',
        'production' => 'prod',
        'prod' => 'prod',
    ];

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
     * Anything that is not a recognised entry in ENV_MAP collapses to 'prod',
     * copying App\Env's fail-safe: a missing or misspelled APP_ENV must never
     * paint a staging ribbon on the live site.
     */
    private function env(): string
    {
        $env = strtolower(trim((string) config('app.env')));

        return self::ENV_MAP[$env] ?? 'prod';
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
     * Built with the Collection's map(), not the native array_map(): Scramble's
     * static analysis can trace a Collection::map() closure's return type (as it
     * already does for Event::toFrontendShape() in EventController), but not a
     * plain array_map() callback — with array_map() the exported document showed
     * `"menus": {"type": "array", "items": []}`, i.e. no item shape at all, which
     * would make the generated TypeScript client type menus as `unknown[]`.
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
            'menus' => collect(Occasion::MENU_VALUES)
                ->map(fn (string $value): array => $this->menuEntry($value))
                ->all(),
        ];
    }

    /**
     * One occasion menu, flattened for the client.
     *
     * Deliberately NO `?? ''` fallback for the MENU_INFO lookup below.
     * MENU_VALUES/MENU_LABELS and MENU_INFO are separately-maintained parallel
     * constants (see Occasion's class docblock) that must stay in lockstep. A
     * silent fallback would let a menu value added to MENU_VALUES without a
     * matching MENU_INFO entry publish a menu card with a blank description and
     * blank price on a public reservation form — with no test failing and
     * nothing logged. An empty price on a public form is worse than a loud
     * error, so a mismatch throws instead, naming the offending value.
     *
     * @return array{value:string,label:string,description:string,price:string}
     */
    private function menuEntry(string $value): array
    {
        if (! isset(Occasion::MENU_INFO[$value])) {
            throw new RuntimeException(
                "Occasion::MENU_INFO has no entry for menu value '{$value}' ".
                '(present in MENU_VALUES/MENU_LABELS). The two constants have '.
                'drifted out of lockstep.'
            );
        }

        return [
            'value' => $value,
            'label' => Occasion::MENU_LABELS[$value],
            'description' => Occasion::MENU_INFO[$value]['description'],
            'price' => Occasion::MENU_INFO[$value]['price'],
        ];
    }
}

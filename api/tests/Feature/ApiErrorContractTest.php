<?php

namespace Tests\Feature;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\Rules\Password;
use Tests\TestCase;

class ApiErrorContractTest extends TestCase
{
    public function test_validation_failure_uses_the_legacy_contract(): void
    {
        Route::post('/api/_contract_probe', function () {
            request()->validate([
                'email' => ['required', 'email', 'max:255'],
                'subject' => ['required', 'string'],
            ]);
        });

        $response = $this->postJson('/api/_contract_probe', ['email' => 'nope']);

        $response->assertStatus(400)->assertExactJson([
            'error' => 'Invalid form submission',
            'code' => 'validation_failed',
            'fields' => [
                ['field' => 'email', 'reason' => 'invalid_format'],
                ['field' => 'subject', 'reason' => 'required'],
            ],
        ]);
    }

    public function test_max_length_failure_carries_the_limit_as_params(): void
    {
        Route::post('/api/_contract_probe_len', function () {
            request()->validate(['subject' => ['required', 'max:255']]);
        });

        $response = $this->postJson('/api/_contract_probe_len', [
            'subject' => str_repeat('x', 256),
        ]);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'subject',
            'reason' => 'too_long',
            'params' => ['max' => 255],
        ]);
    }

    public function test_in_rule_failure_carries_the_allowed_values(): void
    {
        Route::post('/api/_contract_probe_in', function () {
            request()->validate([
                'participation' => ['required', 'in:participate,notparticipate'],
            ]);
        });

        $response = $this->postJson('/api/_contract_probe_in', ['participation' => 'maybe']);

        $response->assertStatus(400)->assertJsonPath('fields.0', [
            'field' => 'participation',
            'reason' => 'invalid_value',
            'params' => ['allowed' => ['participate', 'notparticipate']],
        ]);
    }

    public function test_unauthenticated_request_uses_the_legacy_contract(): void
    {
        $this->getJson('/api/user')->assertStatus(401)->assertExactJson([
            'error' => 'Not authenticated',
            'code' => 'not_authenticated',
        ]);
    }

    /**
     * Every other test here uses getJson()/postJson(), which set
     * `Accept: application/json` — and that header is exactly what used to hide
     * this. Without it, Laravel's default guest redirect (installed by
     * ApplicationBuilder::withMiddleware() as
     * `redirectGuestsTo(fn () => route('login'))`) ran inside the Authenticate
     * middleware, BEFORE any exception renderer, and blew up with
     * RouteNotFoundException: an API-only app defines no `login` route. On PROD,
     * APP_DEBUG=false turns that into an opaque 500 for anyone who pastes an API
     * URL into a browser. bootstrap/app.php overrides the redirect with
     * `fn () => null`; this pins that the contract holds whatever the client asks
     * for.
     */
    public function test_unauthenticated_request_without_a_json_accept_header_still_uses_the_contract(): void
    {
        $expected = ['error' => 'Not authenticated', 'code' => 'not_authenticated'];

        // A browser's Accept header, i.e. the URL-pasted-into-the-address-bar case.
        $this->get('/api/user', ['Accept' => 'text/html,application/xhtml+xml,*/*;q=0.8'])
            ->assertStatus(401)
            ->assertExactJson($expected);

        // And with no Accept header at all (curl's default).
        $this->call('GET', '/api/user')
            ->assertStatus(401)
            ->assertExactJson($expected);
    }

    public function test_authorization_failure_uses_the_legacy_contract(): void
    {
        Route::get('/api/_contract_probe_403', function () {
            throw new AuthorizationException;
        });

        $this->getJson('/api/_contract_probe_403')->assertStatus(403)->assertExactJson([
            'error' => 'Access denied',
            'code' => 'access_denied',
        ]);
    }

    public function test_only_the_first_failure_per_field_is_reported(): void
    {
        Route::post('/api/_contract_probe_first', fn () => request()->validate([
            'email' => ['email', 'max:5'],
        ]));

        $this->postJson('/api/_contract_probe_first', ['email' => 'not-an-email-at-all'])
            ->assertStatus(400)
            ->assertJsonPath('fields', [['field' => 'email', 'reason' => 'invalid_format']]);
    }

    /**
     * snake() is the only non-trivial mapping step, and every other rule the
     * suite drives is single-word, where it degenerates to strtolower(). Laravel
     * reports this one as `DateFormat`, so if the regex broke it would degrade
     * to invalid_value with the rest of the suite still green.
     */
    public function test_multi_word_rule_names_map_to_their_reason(): void
    {
        Route::post('/api/_contract_probe_date_format', fn () => request()->validate([
            'startTime' => ['date_format:H:i'],
        ]));

        $this->postJson('/api/_contract_probe_date_format', ['startTime' => 'half past two'])
            ->assertStatus(400)
            ->assertJsonPath('fields.0', ['field' => 'startTime', 'reason' => 'invalid_format']);
    }

    public function test_a_numeric_rule_failure_uses_a_paramless_reason(): void
    {
        // invalid_value interpolates {{allowed}} in i18n.js, and i18next emits
        // that placeholder literally when no value is supplied — so numeric
        // failures must NOT use it.
        Route::post('/api/_contract_probe_gt', fn () => request()->validate([
            'eventId' => ['required', 'integer', 'gt:0'],
        ]));

        $this->postJson('/api/_contract_probe_gt', ['eventId' => 0])
            ->assertStatus(400)
            ->assertJsonPath('fields', [['field' => 'eventId', 'reason' => 'invalid_number']]);
    }

    public function test_method_not_allowed_uses_the_legacy_contract(): void
    {
        Route::get('/api/_contract_probe_405', fn () => response()->json(['ok' => true]));

        $this->postJson('/api/_contract_probe_405')->assertStatus(405)->assertExactJson([
            'error' => 'Method not allowed',
            'code' => 'method_not_allowed',
        ]);
    }

    public function test_csrf_token_mismatch_uses_the_legacy_contract(): void
    {
        Route::post('/api/_contract_probe_419', fn () => throw new TokenMismatchException);

        $this->postJson('/api/_contract_probe_419')->assertStatus(419)->assertExactJson([
            'error' => 'Invalid session',
            'code' => 'invalid_session',
        ]);
    }

    /**
     * The 419 renderer is the one closure deliberately type-hinted on the broad
     * HttpException base, so its status check is the only thing stopping it
     * swallowing every other HttpException. The 403/405 tests cannot pin that:
     * their closures are registered earlier and short-circuit before the
     * catch-all runs.
     */
    public function test_the_catch_all_http_renderer_ignores_other_statuses(): void
    {
        Route::get('/api/_contract_probe_404', fn () => abort(404));

        $response = $this->getJson('/api/_contract_probe_404');

        $response->assertStatus(404);
        $this->assertStringNotContainsString('invalid_session', $response->getContent());
        $response->assertJsonMissingPath('code');
    }

    /**
     * Rules outside REASONS must not reach a reason that interpolates. Object
     * rules are the likely trigger: Validator::validateUsingCustomRule() keys
     * failedRules on get_class($rule), so Rule::enum(...) arrives as an FQCN
     * that snake() cannot map, with no parameters to interpolate from.
     */
    public function test_an_unmapped_rule_falls_back_to_a_paramless_reason(): void
    {
        Route::post('/api/_contract_probe_unmapped', fn () => request()->validate([
            'subject' => ['between:1,10'],
            'password' => [Password::min(8)],
        ]));

        $this->postJson('/api/_contract_probe_unmapped', [
            'subject' => str_repeat('x', 50),
            'password' => 'short',
        ])->assertStatus(400)->assertJsonPath('fields', [
            ['field' => 'subject', 'reason' => 'invalid_format'],
            ['field' => 'password', 'reason' => 'invalid_format'],
        ]);
    }

    /**
     * The `$request->is('api/*')` guard is what keeps the old app's web pages on
     * Laravel's HTML error pages. Nothing else pins the `: null` fallthrough.
     */
    public function test_non_api_routes_do_not_get_the_json_contract(): void
    {
        Route::get('/_contract_probe_web_403', fn () => throw new AuthorizationException);

        $response = $this->get('/_contract_probe_web_403');

        $response->assertStatus(403);
        $this->assertStringNotContainsString('access_denied', $response->getContent());
    }
}

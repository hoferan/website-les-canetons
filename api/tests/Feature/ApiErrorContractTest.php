<?php

namespace Tests\Feature;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
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

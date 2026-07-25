<?php

namespace Tests\Feature;

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

    public function test_only_the_first_failure_per_field_is_reported(): void
    {
        Route::post('/api/_contract_probe_first', function () {
            request()->validate(['email' => ['required', 'email']]);
        });

        $response = $this->postJson('/api/_contract_probe_first', ['email' => '']);

        $response->assertStatus(400)->assertJsonCount(1, 'fields');
    }
}

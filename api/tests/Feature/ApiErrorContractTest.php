<?php

namespace Tests\Feature;

use App\Support\ErrorVocabulary;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Tests\TestCase;

class ApiErrorContractTest extends TestCase
{
    /**
     * The whole problem document, member by member: this is the one test that
     * says what the shape is.
     *
     * Not assertExactJson, because `requestId` is a fresh ULID per request.
     * The members are asserted one by one, and the closing assertion pins the
     * key set, so adding or dropping a member still fails.
     */
    public function test_a_failure_is_an_rfc_9457_problem_document(): void
    {
        Route::post('/api/v1/_contract_probe', function () {
            request()->validate([
                'email' => ['required', 'email', 'max:255'],
                'subject' => ['required', 'string'],
            ]);
        });

        $response = $this->postJson('/api/v1/_contract_probe', ['email' => 'nope']);

        $response->assertStatus(400);

        // RFC 9457 §3: the media type is how a client knows this is a problem
        // document and not the resource it asked for.
        $this->assertSame(
            'application/problem+json',
            $response->headers->get('Content-Type'),
            'A problem document served as application/json is not a problem document.'
        );

        $body = $response->json();

        $this->assertSame('Invalid form submission', $body['title']);
        $this->assertSame(400, $body['status']);
        $this->assertSame('/api/v1/_contract_probe', $body['instance']);
        $this->assertSame('validation_failed', $body['code']);
        $this->assertSame([
            ['field' => 'email', 'reason' => 'invalid_format'],
            ['field' => 'subject', 'reason' => 'required'],
        ], $body['errors']);

        // A ULID, not just a string: it must match a log line, and Str::isUlid
        // is what the middleware uses to decide whether to trust an inbound one.
        $this->assertTrue(Str::isUlid($body['requestId']), 'requestId is not a ULID.');

        // The explanation travels with the failure, so the reference has no
        // catalogue and no endpoint serves one.
        $this->assertSame(ErrorVocabulary::detailFor('validation_failed'), $body['detail']);

        // No `type`: RFC 9457 makes it optional, and here it would only be a
        // constant prefix in front of `code`.
        $this->assertArrayNotHasKey('type', $body);
        // No `documentation` link either; `detail` carries the explanation.
        $this->assertArrayNotHasKey('documentation', $body);

        $this->assertSame(
            ['title', 'status', 'code', 'instance', 'errors', 'requestId', 'detail'],
            array_keys($body),
            'The problem document gained or lost a member. Three things have to move with '
            .'it: web/src/api/http.ts, App\Support\Scramble\ErrorResponseSchema, and the '
            .'worked example in config/scramble.php — which DocsDescriptionTest checks '
            .'against this very shape.'
        );
    }

    /**
     * `errors` is present even when there is nothing field-level to say.
     * Omitting it would make it optional in the document and cost every
     * consumer a null check for a case that carries no information.
     */
    public function test_errors_is_present_and_empty_when_there_is_nothing_to_say(): void
    {
        $response = $this->getJson('/api/v1/me')->assertStatus(401);

        $this->assertSame([], $response->json('errors'));
    }

    public function test_max_length_failure_carries_the_limit_as_params(): void
    {
        Route::post('/api/v1/_contract_probe_len', function () {
            request()->validate(['subject' => ['required', 'max:255']]);
        });

        $response = $this->postJson('/api/v1/_contract_probe_len', [
            'subject' => str_repeat('x', 256),
        ]);

        $response->assertStatus(400)->assertJsonPath('errors.0', [
            'field' => 'subject',
            'reason' => 'too_long',
            'params' => ['max' => 255],
        ]);
    }

    public function test_in_rule_failure_carries_the_allowed_values(): void
    {
        Route::post('/api/v1/_contract_probe_in', function () {
            request()->validate([
                'participation' => ['required', 'in:participate,notparticipate'],
            ]);
        });

        $response = $this->postJson('/api/v1/_contract_probe_in', ['participation' => 'maybe']);

        $response->assertStatus(400)->assertJsonPath('errors.0', [
            'field' => 'participation',
            'reason' => 'invalid_value',
            'params' => ['allowed' => ['participate', 'notparticipate']],
        ]);
    }

    public function test_unauthenticated_request_uses_the_problem_contract(): void
    {
        $this->getJson('/api/v1/me')->assertStatus(401)->assertJson([
            'title' => 'Not authenticated',
            'code' => 'not_authenticated',
        ]);
    }

    /**
     * Every other test here sends `Accept: application/json`, which hides this
     * case. Without it, Laravel's default guest redirect
     * (`redirectGuestsTo(fn () => route('login'))`, installed by
     * ApplicationBuilder::withMiddleware()) runs inside the Authenticate
     * middleware, before any exception renderer, and throws
     * RouteNotFoundException because an API-only app has no `login` route.
     * With APP_DEBUG=false that is an opaque 500 for anyone who pastes an API
     * URL into a browser. bootstrap/app.php overrides the redirect with
     * `fn () => null`.
     */
    public function test_unauthenticated_request_without_a_json_accept_header_still_uses_the_contract(): void
    {
        $expected = ['title' => 'Not authenticated', 'code' => 'not_authenticated'];

        // A browser's Accept header, i.e. the URL-pasted-into-the-address-bar case.
        $this->get('/api/v1/me', ['Accept' => 'text/html,application/xhtml+xml,*/*;q=0.8'])
            ->assertStatus(401)
            ->assertJson($expected);

        // And with no Accept header at all (curl's default).
        $this->call('GET', '/api/v1/me')
            ->assertStatus(401)
            ->assertJson($expected);
    }

    public function test_authorization_failure_uses_the_problem_contract(): void
    {
        Route::get('/api/v1/_contract_probe_403', function () {
            throw new AuthorizationException;
        });

        $this->getJson('/api/v1/_contract_probe_403')->assertStatus(403)->assertJson([
            'title' => 'Access denied',
            'code' => 'access_denied',
        ]);
    }

    public function test_only_the_first_failure_per_field_is_reported(): void
    {
        Route::post('/api/v1/_contract_probe_first', fn () => request()->validate([
            'email' => ['email', 'max:5'],
        ]));

        $this->postJson('/api/v1/_contract_probe_first', ['email' => 'not-an-email-at-all'])
            ->assertStatus(400)
            ->assertJsonPath('errors', [['field' => 'email', 'reason' => 'invalid_format']]);
    }

    /**
     * snake() is the only non-trivial mapping step, and every other rule the
     * suite drives is single-word, where it degenerates to strtolower(). Laravel
     * reports this one as `DateFormat`, so if the regex broke it would degrade
     * to invalid_value with the rest of the suite still green.
     */
    public function test_multi_word_rule_names_map_to_their_reason(): void
    {
        Route::post('/api/v1/_contract_probe_date_format', fn () => request()->validate([
            'startTime' => ['date_format:H:i'],
        ]));

        $this->postJson('/api/v1/_contract_probe_date_format', ['startTime' => 'half past two'])
            ->assertStatus(400)
            ->assertJsonPath('errors.0', ['field' => 'startTime', 'reason' => 'invalid_format']);
    }

    public function test_a_numeric_rule_failure_uses_a_paramless_reason(): void
    {
        // invalid_value interpolates {{allowed}} in web/src/i18n/, and i18next
        // prints the placeholder literally when no value is supplied, so
        // numeric failures must not use it.
        Route::post('/api/v1/_contract_probe_gt', fn () => request()->validate([
            'eventId' => ['required', 'integer', 'gt:0'],
        ]));

        $this->postJson('/api/v1/_contract_probe_gt', ['eventId' => 0])
            ->assertStatus(400)
            ->assertJsonPath('errors', [['field' => 'eventId', 'reason' => 'invalid_number']]);
    }

    public function test_method_not_allowed_uses_the_problem_contract(): void
    {
        Route::get('/api/v1/_contract_probe_405', fn () => response()->json(['ok' => true]));

        $this->postJson('/api/v1/_contract_probe_405')->assertStatus(405)->assertJson([
            'title' => 'Method not allowed',
            'code' => 'method_not_allowed',
        ]);
    }

    public function test_csrf_token_mismatch_uses_the_problem_contract(): void
    {
        Route::post('/api/v1/_contract_probe_419', fn () => throw new TokenMismatchException);

        $this->postJson('/api/v1/_contract_probe_419')->assertStatus(419)->assertJson([
            'title' => 'Invalid session',
            'code' => 'invalid_session',
        ]);
    }

    /**
     * The 419 renderer is the one closure deliberately type-hinted on the broad
     * HttpException base, so its status check is the only thing stopping it
     * swallowing every other HttpException. The 403/405 tests cannot pin that:
     * their closures are registered earlier and short-circuit before the
     * catch-all runs.
     *
     * A 404 is caught by a dedicated NotFoundHttpException renderer, registered
     * before this catch-all so it is reachable: it answers `not_found`, never
     * `invalid_session`.
     */
    public function test_the_catch_all_http_renderer_does_not_swallow_other_statuses(): void
    {
        Route::get('/api/v1/_contract_probe_404', fn () => abort(404));

        $response = $this->getJson('/api/v1/_contract_probe_404');

        $response->assertStatus(404);
        $this->assertStringNotContainsString('invalid_session', $response->getContent());
        $response->assertJsonPath('code', 'not_found');
    }

    /**
     * Rules outside REASONS must not reach a reason that interpolates. Object
     * rules are the likely trigger: Validator::validateUsingCustomRule() keys
     * failedRules on get_class($rule), so Rule::enum(...) arrives as an FQCN
     * that snake() cannot map, with no parameters to interpolate from.
     */
    public function test_an_unmapped_rule_falls_back_to_a_paramless_reason(): void
    {
        Route::post('/api/v1/_contract_probe_unmapped', fn () => request()->validate([
            'subject' => ['between:1,10'],
            'password' => [Password::min(8)],
        ]));

        $this->postJson('/api/v1/_contract_probe_unmapped', [
            'subject' => str_repeat('x', 50),
            'password' => 'short',
        ])->assertStatus(400)->assertJsonPath('errors', [
            ['field' => 'subject', 'reason' => 'invalid_format'],
            ['field' => 'password', 'reason' => 'invalid_format'],
        ]);
    }

    /**
     * The `$request->is('api/*')` guard keeps non-API routes on Laravel's HTML
     * error pages. Nothing else pins the `: null` fallthrough.
     */
    public function test_non_api_routes_do_not_get_the_json_contract(): void
    {
        Route::get('/_contract_probe_web_403', fn () => throw new AuthorizationException);

        $response = $this->get('/_contract_probe_web_403');

        $response->assertStatus(403);
        $this->assertStringNotContainsString('access_denied', $response->getContent());
    }
}

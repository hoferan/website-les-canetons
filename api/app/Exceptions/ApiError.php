<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;

/**
 * Renders exceptions into the JSON error contract the front-end consumes:
 *
 *     {"error": "...", "code": "...", "fields": [{"field", "reason", "params"?}]}
 *
 * This deliberately replaces Laravel's native {message, errors:{}} shape.
 * web/src/i18n/'s translateApiError() is the ONLY place French is
 * computed in the whole system, and it maps `code` and `fields[].reason` —
 * stable machine tokens — onto French text. Laravel's native shape carries
 * English prose instead, which that layer cannot translate. Keeping this
 * contract is also what upholds the project rule that API bodies stay English.
 *
 * Every `reason` and `field` token emitted here must exist as a key in
 * web/src/i18n/fr.ts; ApiErrorVocabularyTest enforces this.
 */
final class ApiError
{
    /**
     * Laravel rule name => legacy reason token.
     *
     * 'invalid_value' is RESERVED for the `in` rule. web/src/i18n/fr.ts renders
     * it as "doit être l'une des valeurs suivantes : {{allowed}}", and `in` is the
     * only rule for which validation() supplies that `allowed` parameter —
     * i18next emits the placeholder literally when no value is given. Numeric
     * failures therefore use the paramless 'invalid_number' instead.
     *
     * That reservation is structural, not a convention to remember: rules
     * absent from this map fall back to the generic, paramless
     * 'invalid_format', so 'invalid_value' is reachable ONLY via the explicit
     * 'in' entry below and no interpolating token can ever ship without its
     * params. Keep it that way — if a future entry maps to a reason that
     * interpolates, it needs a matching `params` branch in validation().
     *
     * The fallback still only guarantees a sensible sentence, not an accurate
     * one: an unmapped rule tells the user their input "n'est pas dans un
     * format valide" whatever actually went wrong. Anything needing a precise
     * message gets an explicit entry.
     */
    private const REASONS = [
        'required' => 'required',
        'max' => 'too_long',
        'email' => 'invalid_format',
        'date' => 'invalid_format',
        'date_format' => 'invalid_format',
        'string' => 'invalid_type',
        'integer' => 'invalid_type',
        'boolean' => 'invalid_type',
        'array' => 'invalid_type',
        'in' => 'invalid_value',
        // Laravel's `min` is polymorphic — numeric value, string length and
        // array count all report as `Min`, with nothing in failedRules to tell
        // them apart. This mapping suits the numeric case; a string or array
        // `min` would render "n'est pas un nombre valide" and needs its own
        // too_short token (mirroring too_long) rather than reusing this entry.
        'min' => 'invalid_number',
        'gt' => 'invalid_number',
    ];

    /**
     * Rule-driven failures are mapped through REASONS below; closure-added ones
     * are passed through verbatim.
     *
     * The first loop is built from the validator's failedRules, so it sees only
     * rule failures. The two idiomatic ways to raise a business-rule error —
     * ValidationException::withMessages() and
     * $validator->after(fn ($v) => $v->errors()->add(...)) — never touch
     * failedRules, so on their own they would render with NO `fields` entry and
     * the UI would have nothing to highlight. The second loop closes that gap:
     * for any field carrying a message but no failed rule, the MESSAGE IS THE
     * REASON TOKEN, emitted as-is. So a closure validator must add a bare token
     * (e.g. 'invalid_format'), never a prose sentence — see any FormRequest's
     * withValidator()/after() hook that calls $validator->errors()->add().
     *
     * That token must also be a PARAMLESS one. This path emits `field` and
     * `reason` only, with no way to attach `params`, and i18next prints a
     * missing interpolation value literally — so a token whose French
     * interpolates (today: 'too_long' and the `in`-only 'invalid_value') would
     * put a raw {{max}} or {{allowed}} on the user's screen. Raise those
     * through ApiError::json() with an explicit `fields` array instead.
     */
    public static function validation(ValidationException $e): JsonResponse
    {
        $fields = [];

        // One entry per field, first failure only — the old Validator broke out
        // of its constraint loop on the first hit, and web/src/i18n/ renders one
        // message per field.
        foreach ($e->validator->failed() as $field => $rules) {
            $failedRule = (string) array_key_first($rules);
            $rule = self::snake($failedRule);
            $parameters = array_values((array) $rules[$failedRule]);
            $reason = self::REASONS[$rule] ?? 'invalid_format';

            // Both branches key on the RULE, not the reason: $parameters is
            // positional, so it only means what we assume for that one rule.
            // Nothing else maps to too_long today, but if `between:1,255` were
            // ever added to REASONS as one, keying on the reason would read its
            // ["1","255"] and emit params.max = 1.
            //
            // $field is cast because PHP turns numeric-string array keys into
            // ints, which would ship "field": 0 for a list payload and change
            // the contract's type.
            $entry = ['field' => (string) $field, 'reason' => $reason];
            if ($rule === 'max') {
                $entry['params'] = ['max' => (int) $parameters[0]];
            } elseif ($rule === 'in') {
                $entry['params'] = ['allowed' => $parameters];
            }

            $fields[] = $entry;
        }

        // Closure-added errors, appended after the rule-driven ones so the
        // reported order still starts with the rules() sequence. Only the first
        // message per field is used, matching the one-entry-per-field rule above.
        $reported = array_column($fields, 'field');
        foreach ($e->validator->errors()->keys() as $field) {
            if (in_array((string) $field, $reported, true)) {
                continue;
            }

            $fields[] = [
                'field' => (string) $field,
                'reason' => (string) $e->validator->errors()->first($field),
            ];
        }

        return self::json(400, 'validation_failed', 'Invalid form submission', $fields);
    }

    /**
     * The $e parameter is unused on purpose: these renderers mirror the types
     * of the render() closures in bootstrap/app.php so the two cannot drift.
     * The load-bearing type-hints are the closures' own — Laravel matches
     * callbacks on the first closure parameter's type, so widening one of these
     * to `mixed` would change no behaviour, it would just remove the signal.
     */
    public static function unauthenticated(AuthenticationException $e): JsonResponse
    {
        return self::json(401, 'not_authenticated', 'Not authenticated');
    }

    /**
     * Typed on Symfony's AccessDeniedHttpException, NOT on Laravel's
     * AuthorizationException — see bootstrap/app.php for why. A thrown
     * AuthorizationException still lands here; it has just been rewritten by
     * then. $e is unused deliberately; see unauthenticated().
     */
    public static function forbidden(AccessDeniedHttpException $e): JsonResponse
    {
        return self::json(403, 'access_denied', 'Access denied');
    }

    /** $e is unused deliberately; see unauthenticated(). */
    public static function methodNotAllowed(MethodNotAllowedHttpException $e): JsonResponse
    {
        return self::json(405, 'method_not_allowed', 'Method not allowed');
    }

    /**
     * The schema is not known to be current, so the request was refused rather
     * than served against a possibly half-applied database — see
     * App\Http\Middleware\RunPendingMigrations.
     *
     * 503 and the generic `service_unavailable` code, not a bespoke one:
     * web/src/i18n/fr.ts already renders it as "Service indisponible", and that
     * is exactly what this is from the visitor's side — a temporary refusal to
     * serve, retry shortly. $e is unused deliberately; see unauthenticated().
     */
    public static function serviceUnavailable(SchemaUnavailable $e): JsonResponse
    {
        return self::json(503, 'service_unavailable', 'Service unavailable');
    }

    /**
     * A CSRF/session-expiry 419. Typed on the base HttpException and discriminated
     * by status, NOT on Illuminate\Session\TokenMismatchException — see
     * bootstrap/app.php for why. $e is otherwise unused; see unauthenticated().
     */
    public static function invalidSession(HttpException $e): ?JsonResponse
    {
        if ($e->getStatusCode() !== 419) {
            return null;
        }

        return self::json(419, 'invalid_session', 'Invalid session');
    }

    /** @param array<int, array<string, mixed>> $fields */
    public static function json(
        int $status,
        string $code,
        string $message,
        array $fields = []
    ): JsonResponse {
        $body = ['error' => $message, 'code' => $code];
        if ($fields !== []) {
            // array_values, because an associative array would serialise as a
            // JSON object and web/src/i18n/ calls .map() on this — a TypeError in
            // the browser. Nothing statically checks the @param above.
            $body['fields'] = array_values($fields);
        }

        return response()->json($body, $status);
    }

    /**
     * Laravel reports failed STRING rules in StudlyCase (e.g. DateFormat).
     *
     * Object rules do not: Validator::validateUsingCustomRule() keys
     * failedRules on get_class($rule), so Rule::enum(...), Password::defaults()
     * or any custom ValidationRule arrives as a fully-qualified class name with
     * an empty parameter list. This mangles it to something like
     * illuminate\_validation\_rules\_enum, which never matches REASONS and
     * lands on the fallback — by design, and the reason that fallback must stay
     * paramless.
     */
    private static function snake(string $rule): string
    {
        return strtolower((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $rule));
    }
}

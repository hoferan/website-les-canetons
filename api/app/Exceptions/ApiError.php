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
 * app/assets/js/i18n.js's translateApiError() is the ONLY place French is
 * computed in the whole system, and it maps `code` and `fields[].reason` —
 * stable machine tokens — onto French text. Laravel's native shape carries
 * English prose instead, which that layer cannot translate. Keeping this
 * contract is also what upholds the project rule that API bodies stay English.
 *
 * Every `reason` and `field` token emitted here must exist as a key in
 * i18n.js; a later task adds ApiErrorVocabularyTest to enforce this.
 */
final class ApiError
{
    /**
     * Laravel rule name => legacy reason token.
     *
     * Rules absent from this map fall back to 'invalid_value', which is a
     * DEGRADED last resort, not a safe default: i18n.js renders that reason as
     * "doit être l'une des valeurs suivantes : {{allowed}}", and validation()
     * only supplies `allowed` for the `in` rule. Every other rule reaching that
     * fallback — including the mapped 'min', 'gt' and 'exists' — shows the user
     * a literal, unsubstituted "{{allowed}}".
     *
     * So any new rule that needs a sane user-visible message must get an
     * explicit entry here (and, if it interpolates, a `params` branch in
     * validation()). Fixing the underlying i18n string is a separate decision.
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
        'min' => 'invalid_value',
        'gt' => 'invalid_value',
        'exists' => 'invalid_value',
    ];

    /**
     * Only rule-driven failures populate `fields`, because that list is built
     * from the validator's failedRules. The two idiomatic ways to raise a
     * business-rule error — ValidationException::withMessages() and
     * $validator->after(fn ($v) => $v->errors()->add(...)) — never touch
     * failedRules, so they render here with NO `fields` key at all and the UI
     * has nothing to highlight.
     *
     * Raise those through ApiError::json() with an explicit `fields` array
     * instead.
     */
    public static function validation(ValidationException $e): JsonResponse
    {
        $fields = [];

        // One entry per field, first failure only — the old Validator broke out
        // of its constraint loop on the first hit, and i18n.js renders one
        // message per field.
        foreach ($e->validator->failed() as $field => $rules) {
            $failedRule = (string) array_key_first($rules);
            $rule = self::snake($failedRule);
            $parameters = array_values((array) $rules[$failedRule]);
            $reason = self::REASONS[$rule] ?? 'invalid_value';

            // Both branches key on the RULE, not the reason: $parameters is
            // positional and only means what we assume for that one rule.
            // `between:1,255` also maps to too_long but yields ["1","255"],
            // which would emit params.max = 1.
            $entry = ['field' => $field, 'reason' => $reason];
            if ($rule === 'max' && isset($parameters[0])) {
                $entry['params'] = ['max' => (int) $parameters[0]];
            } elseif ($rule === 'in') {
                $entry['params'] = ['allowed' => $parameters];
            }

            $fields[] = $entry;
        }

        return self::json(400, 'validation_failed', 'Invalid form submission', $fields);
    }

    /**
     * The $e parameter is unused on purpose. These renderers keep a uniform
     * signature for the render() closures in bootstrap/app.php, and the
     * type-hint is load-bearing: Laravel matches render callbacks on the first
     * closure parameter's type. Do not "simplify" it away.
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
            $body['fields'] = $fields;
        }

        return response()->json($body, $status);
    }

    /** Laravel reports failed rules in StudlyCase (e.g. DateFormat). */
    private static function snake(string $rule): string
    {
        return strtolower((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $rule));
    }
}

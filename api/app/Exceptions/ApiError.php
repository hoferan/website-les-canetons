<?php

namespace App\Exceptions;

use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;

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
 * i18n.js; ApiErrorVocabularyTest enforces that.
 */
final class ApiError
{
    /**
     * Laravel rule name => legacy reason token. Rules absent from this map fall
     * back to 'invalid_value', which i18n.js can always render.
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

            $entry = ['field' => $field, 'reason' => $reason];
            if ($reason === 'too_long' && isset($parameters[0])) {
                $entry['params'] = ['max' => (int) $parameters[0]];
            } elseif ($rule === 'in') {
                $entry['params'] = ['allowed' => $parameters];
            }

            $fields[] = $entry;
        }

        return self::json(400, 'validation_failed', 'Invalid form submission', $fields);
    }

    public static function unauthenticated(AuthenticationException $e): JsonResponse
    {
        return self::json(401, 'not_authenticated', 'Not authenticated');
    }

    /**
     * Typed on Symfony's AccessDeniedHttpException, NOT on Laravel's
     * AuthorizationException — see bootstrap/app.php for why. A thrown
     * AuthorizationException still lands here; it has just been rewritten by
     * then.
     */
    public static function forbidden(AccessDeniedHttpException $e): JsonResponse
    {
        return self::json(403, 'access_denied', 'Access denied');
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

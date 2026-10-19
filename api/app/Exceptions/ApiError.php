<?php

namespace App\Exceptions;

use App\Http\Middleware\RequestId;
use App\Support\ErrorVocabulary;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Renders every failure as an RFC 9457 problem document:
 *
 *     Content-Type: application/problem+json
 *
 *     {
 *       "title":     "Invalid form submission",
 *       "status":    400,
 *       "code":      "validation_failed",
 *       "instance":  "/api/v1/events/42",
 *       "errors":    [{"field": "endsAt", "reason": "must_be_after", "params"?: {}}],
 *       "requestId": "01JB3K7QW8ZX...",
 *       "detail":    "One or more submitted fields were rejected. …"
 *     }
 *
 * This replaces Laravel's native {message, errors:{}} shape, which carries
 * English prose. web/src/i18n/'s translateApiError() is the only place UI
 * language is computed, and it maps the stable tokens `code` and
 * `errors[].reason` onto French and German text, so API bodies stay English.
 *
 * Every `reason` and `field` token emitted here must exist as a key in
 * web/src/i18n/fr.ts; ApiErrorVocabularyTest enforces this.
 *
 * A standard shape, so a third-party integrator with only the document in
 * hand does not have to learn a bespoke error envelope.
 *
 * No `type` member, which RFC 9457 makes optional (absent reads as
 * `about:blank`): any value would be a constant prefix plus the `code` and
 * carry no extra information.
 *
 * `code` is the discriminator and `detail` is the explanation, in the same
 * response. See App\Support\ErrorVocabulary.
 */
final class ApiError
{
    /** RFC 9457 §3. Deliberately not application/json. */
    public const MEDIA_TYPE = 'application/problem+json';

    /**
     * Laravel rule name => reason token.
     *
     * 'invalid_value' is reserved for the `in` rule: its copy interpolates
     * {{allowed}}, which validation() supplies only for `in`, and i18next
     * prints a missing placeholder literally. Numeric failures use the
     * paramless 'invalid_number'.
     *
     * Unmapped rules fall back to the paramless 'invalid_format', so an
     * interpolating token is reachable only through an explicit entry. Any
     * entry that maps to an interpolating reason needs a matching `params`
     * branch in validation().
     *
     * The fallback gives a sensible sentence, not an accurate one ("n'est pas
     * dans un format valide" whatever went wrong). Anything needing a precise
     * message gets an explicit entry.
     */
    private const REASONS = [
        'required' => 'required',
        'max' => 'too_long',
        // The likeliest failure on the roster form, where the generic
        // fallback would be wrong for a taken username.
        //
        // `exists` is deliberately unmapped: it only fails from a stale form
        // holding a deleted register or role, which a reload fixes.
        'unique' => 'already_taken',
        'email' => 'invalid_format',
        'date' => 'invalid_format',
        'date_format' => 'invalid_format',
        'string' => 'invalid_type',
        'integer' => 'invalid_type',
        'boolean' => 'invalid_type',
        'array' => 'invalid_type',
        'in' => 'invalid_value',
        // Laravel's `min` reports numeric value, string length and array count
        // alike, with nothing in failedRules to tell them apart. This entry
        // takes the string-length reading (the password minimum, the only use)
        // and mirrors too_long, params branch included.
        //
        // A numeric minimum must use `gt`, which maps to 'invalid_number';
        // `min:1` on a number would tell the user it "est trop court".
        'min' => 'too_short',
        'gt' => 'invalid_number',
        // `after:startsAt` on the event form's end time, which the fallback
        // would wrongly report as a bad format.
        //
        // Paramless on purpose: `after`'s parameter is the other field's
        // English name, which must not reach the screen, so the copy names the
        // start in words. That makes the token specific to this field pair:
        // another `after:` rule against a different field needs its own token
        // (noted in fr.ts too).
        'after' => 'must_be_after',
    ];

    /**
     * Rule-driven failures are mapped through REASONS; closure-added ones are
     * passed through verbatim.
     *
     * The first loop reads the validator's failedRules, so it sees only rule
     * failures. ValidationException::withMessages() and
     * $validator->after(fn ($v) => $v->errors()->add(...)) never touch
     * failedRules, so the second loop covers them: for a field with a message
     * but no failed rule, the message is the reason token, emitted as-is. A
     * closure validator must therefore add a bare token such as
     * 'invalid_format', never a sentence.
     *
     * That token must also be paramless, because this path cannot attach
     * `params` and i18next prints a missing interpolation value literally.
     * Raise interpolating tokens (such as 'too_long' or 'invalid_value')
     * through ApiError::json() with an explicit `errors` array instead.
     */
    public static function validation(ValidationException $e): JsonResponse
    {
        $fields = [];

        // One entry per field, first failure only: web/src/i18n/ renders one
        // message per field.
        foreach ($e->validator->failed() as $field => $rules) {
            $failedRule = (string) array_key_first($rules);
            $rule = self::snake($failedRule);
            $parameters = array_values((array) $rules[$failedRule]);
            $reason = self::REASONS[$rule] ?? 'invalid_format';

            // The branches key on the rule, not the reason: $parameters is
            // positional and only means what we assume for that one rule
            // (`between:1,255` mapped to too_long would emit params.max = 1).
            //
            // $field is cast because PHP turns numeric-string array keys into
            // ints, which would ship "field": 0 for a list payload.
            $entry = ['field' => (string) $field, 'reason' => $reason];
            if ($rule === 'max') {
                $entry['params'] = ['max' => (int) $parameters[0]];
            } elseif ($rule === 'min') {
                // Required: 'too_short' interpolates {{min}}, and i18next
                // prints a missing value literally.
                $entry['params'] = ['min' => (int) $parameters[0]];
            } elseif ($rule === 'in') {
                $entry['params'] = ['allowed' => $parameters];
            }

            $fields[] = $entry;
        }

        // Closure-added errors, after the rule-driven ones, first message per
        // field only.
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
     * Laravel matches on the closures' own parameter types, so these are a
     * signal only.
     */
    public static function unauthenticated(AuthenticationException $e): JsonResponse
    {
        return self::json(401, 'not_authenticated', 'Not authenticated');
    }

    /**
     * Typed on Symfony's AccessDeniedHttpException, not Laravel's
     * AuthorizationException (see bootstrap/app.php). A thrown
     * AuthorizationException is rewritten into one before it lands here.
     * $e is unused deliberately; see unauthenticated().
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
     * 404, for an unknown route and for route-model binding alike.
     *
     * One code for both, and the message says no more than the code: telling
     * "no such event" from "no such route" would allow the enumeration a 404
     * is meant to prevent.
     *
     * $e is unused deliberately; see unauthenticated().
     */
    public static function notFound(NotFoundHttpException $e): JsonResponse
    {
        return self::json(404, 'not_found', 'Not found');
    }

    /**
     * The schema is not known to be current, so the request was refused rather
     * than served against a possibly half-applied database (see
     * App\Http\Middleware\RunPendingMigrations).
     *
     * The generic `service_unavailable` code, because to the visitor this is a
     * temporary refusal to serve. $e is unused deliberately; see
     * unauthenticated().
     */
    public static function serviceUnavailable(SchemaUnavailable $e): JsonResponse
    {
        return self::json(503, 'service_unavailable', 'Service unavailable');
    }

    /**
     * A CSRF/session-expiry 419. Typed on the base HttpException and
     * discriminated by status, not on Illuminate\Session\TokenMismatchException
     * (see bootstrap/app.php). $e is otherwise unused; see unauthenticated().
     */
    public static function invalidSession(HttpException $e): ?JsonResponse
    {
        if ($e->getStatusCode() !== 419) {
            return null;
        }

        return self::json(419, 'invalid_session', 'Invalid session');
    }

    /**
     * The single place a problem document is built.
     *
     * RFC 9457 members first, then the two extensions (allowed by §3.2):
     *
     *   `code`      is the discriminator: the stable machine token
     *               web/src/i18n/ translates, and the member any client
     *               should branch on.
     *
     *   `requestId` is what a member reads out over the telephone. See
     *               App\Http\Middleware\RequestId.
     *
     *   `detail`    is RFC 9457's own member: what happened and what to do,
     *               from App\Support\ErrorVocabulary. Prose for a developer,
     *               never shown to a member, who sees text computed from `code`.
     *
     * `errors` is always present, empty when there is nothing field-level to
     * say, so it is required in the document and needs no null check.
     *
     * @param  array<int, array<string, mixed>>  $errors
     */
    public static function json(
        int $status,
        string $code,
        string $message,
        array $errors = []
    ): JsonResponse {
        // array_values, because an associative array would serialise as a JSON
        // object and web/src/i18n/ calls .map() on it. Nothing statically
        // checks the @param above.
        //
        // Outside the literal because Scramble publishes a comment above an
        // array key as that property's description.
        $orderedErrors = array_values($errors);

        $body = [
            'title' => $message,
            'status' => $status,
            'code' => $code,
            'instance' => self::instance(),
            'errors' => $orderedErrors,
            'requestId' => RequestId::current(),
        ];

        // RFC 9457 §3.1.1's `detail`, carried in the response so nobody has to
        // fetch the explanation separately. Added after the literal so the
        // machine-readable members come first and the paragraph last.
        $detail = ErrorVocabulary::detailFor($code);

        if ($detail !== null) {
            $body['detail'] = $detail;
        }

        return response()
            ->json($body, $status)
            // RFC 9457 §3: tells a client this body is a problem document, not
            // the resource it asked for.
            ->header('Content-Type', self::MEDIA_TYPE);
    }

    /**
     * RFC 9457 §3.1's `instance`: what was being asked for, as a path.
     *
     * Path only, never the query string: Apache logs query strings in plain
     * text on this host, and people paste problem documents into chats and
     * issue trackers.
     */
    private static function instance(): string
    {
        // request() is always a Request, even in a console context, where it is
        // an empty one whose path is "/". There is no null case to guard.
        return request()->getPathInfo();
    }

    /**
     * Laravel reports failed string rules in StudlyCase (e.g. DateFormat).
     *
     * Object rules arrive as a fully-qualified class name with no parameters
     * (Validator::validateUsingCustomRule() keys failedRules on
     * get_class($rule)). This mangles them to something like
     * illuminate\_validation\_rules\_enum, which lands on the fallback by
     * design, so the fallback must stay paramless.
     */
    private static function snake(string $rule): string
    {
        return strtolower((string) preg_replace('/(?<!^)[A-Z]/', '_$0', $rule));
    }
}

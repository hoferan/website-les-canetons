<?php

namespace App\Support;

/**
 * What each of this API's failures means, in the words the caller gets.
 *
 * These are RFC 9457 `detail` strings: §3.1.1 defines that member as a
 * human-readable explanation that "SHOULD focus on helping the client correct
 * the problem". App\Exceptions\ApiError puts the matching one into every error
 * response, so the explanation arrives WITH the failure rather than at some
 * other URL.
 *
 * THAT IS THE WHOLE DESIGN, and it replaced a considerably larger one. There
 * was a `type` member, an endpoint serving a document per problem type, a
 * `documentation` link to a per-code anchor, and twenty-one sections in the API
 * reference. André's argument ended all of it: a problem description is only
 * wanted by somebody who has that problem, at the moment they have it, and it
 * is one or two sentences — so making them open a page or issue a second
 * request to read it is pure friction. Inlining is also the more conformant
 * answer, since `detail` is the member the RFC provides for exactly this.
 *
 * WRITTEN FOR A RESPONSE, NOT FOR DOCUMENTATION, which is a real distinction
 * and the reason these were rewritten rather than moved. Documentation explains
 * WHY a thing is designed as it is; a response says what happened and what to do
 * about it. The earlier prose did both, and some of it had no business
 * travelling in a body — `spam_suspected` enumerated all three anti-abuse checks
 * in the very response that is deliberately vague about which one failed, and
 * others explained our account-enumeration defences to the caller being defended
 * against. That rationale now lives in comments here, where it belongs and where
 * it costs nobody any bytes.
 *
 * CHECKED AGAINST THE SOURCE, not trusted. Tests\Feature\ApiErrorVocabularyTest
 * scans app/ for every code the API can emit and asserts this list matches
 * exactly, in both directions — so a code emitted without an entry fails, and an
 * entry for a code nobody emits fails too.
 *
 * English, like every machine-facing string in this API. `detail` is for the
 * developer reading a response, never for a member reading a screen; the French
 * lives in web/src/i18n/fr.ts, keyed by the same `code`.
 */
final class ErrorVocabulary
{
    /**
     * code => detail
     *
     * @var array<string, string>
     */
    public const PROBLEMS = [

        // ---------------------------------------------------------- the form

        'validation_failed' => 'One or more submitted fields were rejected. `errors` names each one '
            .'and why, as machine tokens: read `errors[].field` and `errors[].reason` rather than '
            .'this sentence. A `reason` carries `params` when it needs a number, for example '
            .'`{"max": 255}`.',

        // ------------------------------------------------------- who you are

        // The 401/419 confusion is the most useful thing this vocabulary says,
        // and it is pure "what to do": the two look alike and the correct
        // responses are opposites. Sending a member back to the login screen on
        // a 419 is a bug that has shipped in many an API client.
        'not_authenticated' => 'No session cookie was sent, or it has expired. Call '
            .'POST /api/v1/login. Not to be confused with 419 invalid_session, where you are still '
            .'logged in and only the CSRF token needs re-priming.',

        // DELIBERATELY SAYS NOTHING about which half was wrong. One answer for
        // an unknown username and for a bad password is what stops this endpoint
        // being used to discover which accounts exist — and explaining that
        // defence in the response body, as this entry once did, tells the person
        // probing it exactly what they are up against.
        'invalid_credentials' => 'The username or the password is wrong.',

        // A request Sanctum did not treat as stateful reached an endpoint that
        // needs a session. Distinct from invalid_session on purpose: that one
        // means "prime the cookie and retry", which here would loop forever —
        // the request will not become stateful by being repeated.
        'stateful_request_required' => 'This endpoint authenticates by session cookie, and this '
            .'request could not establish one — its Origin or Referer is not a configured stateful '
            .'domain. Browser clients on the same origin do this automatically; a server-to-server '
            .'caller cannot use this endpoint.',

        'invalid_session' => 'The CSRF token was missing or stale. You are still logged in: call '
            .'GET /sanctum/csrf-cookie and retry the request. Do not send the user back to the '
            .'login screen.',

        // No numbers: the thresholds are a detail of the throttle, and putting
        // them in the refusal only helps somebody tune around it.
        'too_many_attempts' => 'Too many failed attempts. Wait and try again later; further '
            .'attempts before then do not shorten the wait.',

        // Distinct from too_many_attempts, which counts FAILED attempts at one
        // account. This is the per-IP request rate on the public endpoints:
        // nothing failed, you are simply going too fast.
        'rate_limited' => 'Too many requests. The Retry-After header says how long to wait; the '
            .'RateLimit-* headers describe the allowance.',

        'reauth_failed' => 'The current password sent alongside this change was wrong. Your session '
            .'is unaffected — retry with the correct password.',

        // ---------------------------------------- what you are allowed to do

        'access_denied' => 'Your account holds no role granting the permission this route requires. '
            .'GET /api/v1/me lists the permissions you do have.',

        // Worth spelling out that no permission would help: the natural reading
        // of a 403 is "ask somebody for access", and here there is nothing to
        // ask for.
        'not_answerable' => 'Only members who play in a register are asked to answer for events, and '
            .'this account is in none. No permission changes that.',

        // -------------------------------------------------------- what exists

        // One answer for a missing route and a missing record, on purpose: a
        // caller able to tell them apart could enumerate which records exist.
        // That reasoning belongs here, not in the body.
        'not_found' => 'No such route, or no such record.',

        'method_not_allowed' => 'The route exists, but not for this HTTP method. Check whether it '
            .'expects PUT or PATCH rather than POST.',

        // ------------------------------------------ working from current state

        // Names the header AND the read that produces one, because "send
        // If-Match" without saying where a tag comes from is the kind of
        // instruction that sends somebody to the source code.
        'if_match_required' => 'This request replaces or removes something, so it must prove it is '
            .'working from the current state. Read the thing first and send the `ETag` it returns '
            .'back as `If-Match`. Attendance answers are exempt.',

        // DOES NOT CARRY THE CURRENT TAG, and neither does the response — see
        // App\Http\Middleware\ConditionalWrite. Handing it over would let a
        // client retry blindly and land exactly the overwrite it was just
        // stopped from making, which is the whole failure this refusal exists
        // to prevent.
        'if_match_failed' => 'Somebody else changed this since you read it, so the write was '
            .'refused rather than silently discarding their change. Read it again, decide what you '
            .'still want to write, and retry with the new `ETag`.',

        // ---------------------------------- allowed, but not against this state

        'cannot_delete_self' => 'An account cannot delete itself. Ask another member who holds '
            .'members.manage to do it.',

        // Why this is refused at all: taking members.manage from yourself is the
        // fastest way to lock the band out of its own roster, and this host has
        // no shell to repair it with. The caller does not need to know that;
        // they need to know who to ask.
        'cannot_demote_self' => 'An account cannot remove its own members.manage permission. Ask '
            .'another administrator.',

        'cannot_remove_last_administrator' => 'This change would leave nobody able to administer '
            .'members. Grant members.manage to somebody else first.',

        // The rule being protected: a member answering for THEMSELVES owes a
        // reason when withdrawing a yes, and the on-behalf route is exempt — so
        // aiming it at yourself would be a way around that. Saying so in the
        // response would describe the bypass to the person attempting it.
        'cannot_record_for_self' => 'This endpoint records an answer on another member\'s behalf and '
            .'was aimed at you. Use PUT /api/v1/events/{event}/attendance for your own answer.',

        'answer_already_settled' => 'An answer can only be withdrawn within five minutes of being '
            .'recorded. Change it instead. `recordedAt` on the answer tells you whether that window '
            .'is still open.',

        'registration_not_open' => 'Bookings for this event have not opened yet. '
            .'GET /api/v1/events/{event}/registration reports when they do.',

        'registration_closed' => 'Bookings for this event have closed. Those already taken are '
            .'unaffected.',

        'option_has_registrations' => 'That option has already been booked, so it cannot be deleted. '
            .'Cancel the bookings that reference it first.',

        // ----------------------------------------------- the submission itself

        // THE ONE THAT MUST STAY VAGUE. An earlier version of this string listed
        // all three checks the public-write guard applies — the form token, the
        // empty `website` field, and the minimum age — inside the very response
        // that exists to avoid telling a script which one it failed. A
        // legitimate integrator needs the same information and gets it from the
        // reference's "Public forms" section; a script gets nothing.
        'spam_suspected' => 'The submission was refused. Reload the form and send it again. Public '
            .'forms require a form token — see Public forms in the API reference.',

        // --------------------------------------------------- the server itself

        'service_unavailable' => 'The service is temporarily refusing requests. Retry shortly; '
            .'nothing on your side needs changing.',

        'xlsx_unavailable' => 'This server cannot build spreadsheet exports. Request the csv format '
            .'instead.',
    ];

    /**
     * The `reason` tokens an `errors[]` entry can carry.
     *
     * Separate from the codes above because they answer a different question: a
     * code says what went wrong with the REQUEST, a reason what went wrong with
     * one FIELD. Both must have French in web/src/i18n/fr.ts, and
     * ApiErrorVocabularyTest checks both.
     *
     * @var list<string>
     */
    public const REASONS = [
        'required',
        'too_long',
        'too_short',
        'invalid_format',
        'invalid_type',
        'invalid_value',
        'invalid_number',
        'already_taken',
        'must_be_after',
    ];

    /**
     * Every code, for the OpenAPI `code` enum and for the vocabulary test.
     *
     * @return list<string>
     */
    public static function codes(): array
    {
        return array_keys(self::PROBLEMS);
    }

    public static function has(string $code): bool
    {
        return array_key_exists($code, self::PROBLEMS);
    }

    /**
     * The `detail` for a code, or null for one this list does not describe.
     *
     * Null is unreachable in practice — ApiErrorVocabularyTest asserts this list
     * and the codes app/ emits match exactly — and it is modelled anyway,
     * because the alternative when somebody adds a code mid-change is a 500
     * while rendering an error, which is the worst possible moment to fail.
     * ApiError omits the member rather than sending an empty one; RFC 9457 makes
     * `detail` optional.
     */
    public static function detailFor(string $code): ?string
    {
        return self::PROBLEMS[$code] ?? null;
    }
}

<?php

namespace App\Support;

/**
 * What each of this API's failures means, in the words the caller gets.
 *
 * These are RFC 9457 `detail` strings: §3.1.1 defines that member as a
 * human-readable explanation that "SHOULD focus on helping the client correct
 * the problem". App\Exceptions\ApiError puts the matching one into every error
 * response, so the explanation arrives with the failure instead of at another
 * URL. A description is one or two sentences, wanted only by somebody who has
 * that problem at that moment, so there is no per-code page to fetch. ADR 0012.
 *
 * Each string is written for a response: what happened and what to do about
 * it. Why a refusal is designed the way it is stays in the comments here,
 * because some of it must not reach the caller. `spam_suspected` is
 * deliberately vague about which check failed, and the account-enumeration
 * defences are not explained to the caller they defend against.
 *
 * Tests\Feature\ApiErrorVocabularyTest scans app/ for every code the API can
 * emit and asserts this list matches exactly, in both directions.
 *
 * English, like every machine-facing string in this API. `detail` is for the
 * developer reading a response, never for a member reading a screen; the French
 * lives in web/src/i18n/fr.ts, keyed by the same `code`.
 */
final class ErrorVocabulary
{
    /**
     * code => [the HTTP status it is emitted with, the detail]
     *
     * The status is here so the API document can group by it: each operation
     * declares one response per status, carrying the codes (the middleware's
     * and the action's) it can answer with. One entry per code keeps the status
     * and the detail from drifting.
     *
     * Each code has exactly one status. Where a refusal has two statuses it has
     * two codes (App\Support\Reauthentication raises `reauth_failed` at 403 and
     * `too_many_attempts` at 429), so a caller branching on `code` never has to
     * read `status` to know what happened. Tests\Feature\ApiErrorVocabularyTest
     * checks the status against the source.
     *
     * @var array<string, array{0: int, 1: string}>
     */
    public const PROBLEMS = [

        // ---------------------------------------------------------- the form

        'validation_failed' => [400, 'One or more submitted fields were rejected. `errors` names each one '
            .'and why, as machine tokens: read `errors[].field` and `errors[].reason` rather than '
            .'this sentence. A `reason` carries `params` when it needs a number, for example '
            .'`{"max": 255}`.'],

        // ------------------------------------------------------- who you are

        // 401 and 419 look alike and the correct responses are opposites.
        // Sending a member back to the login screen on a 419 is a client bug.
        'not_authenticated' => [401, 'No session cookie was sent, or it has expired. Call '
            .'POST /api/v1/login. Not to be confused with 419 invalid_session, where you are still '
            .'logged in and only the CSRF token needs re-priming.'],

        // Deliberately says nothing about which half was wrong. One answer for
        // an unknown username and a bad password stops this endpoint from
        // revealing which accounts exist; explaining that in the body would
        // tell a prober what they are up against.
        'invalid_credentials' => [401, 'The username or the password is wrong.'],

        // A request Sanctum did not treat as stateful reached an endpoint that
        // needs a session. Distinct from invalid_session, which means "prime the
        // cookie and retry": here that would loop forever, because the request
        // will not become stateful by being repeated.
        'stateful_request_required' => [400, 'This endpoint authenticates by session cookie, and this '
            .'request could not establish one — its Origin or Referer is not a configured stateful '
            .'domain. Browser clients on the same origin do this automatically; a server-to-server '
            .'caller cannot use this endpoint.'],

        'invalid_session' => [419, 'The CSRF token was missing or stale. You are still logged in: call '
            .'GET /sanctum/csrf-cookie and retry the request. Do not send the user back to the '
            .'login screen.'],

        // No numbers: the thresholds are a detail of the throttle, and putting
        // them in the refusal only helps somebody tune around it.
        'too_many_attempts' => [429, 'Too many failed attempts. Wait and try again later; further '
            .'attempts before then do not shorten the wait.'],

        // Distinct from too_many_attempts, which counts failed attempts at one
        // account. This is the per-IP request rate on the public endpoints:
        // nothing failed, the caller is going too fast.
        'rate_limited' => [429, 'Too many requests. The Retry-After header says how long to wait; the '
            .'RateLimit-* headers describe the allowance.'],

        'reauth_failed' => [403, 'The current password sent alongside this change was wrong. Your session '
            .'is unaffected — retry with the correct password.'],

        // ---------------------------------------- what you are allowed to do

        'access_denied' => [403, 'Your account holds no role granting the permission this route requires. '
            .'GET /api/v1/me lists the permissions you do have.'],

        // Spells out whose permission is missing. A 403 normally reads as "ask
        // for access", but the caller already holds what the on-behalf route
        // requires; it is the member they answer for who is not asked to answer.
        'not_answerable' => [403, 'The member this answer is for holds no role granting attendance.respond, '
            .'so no answer is expected from them and none can be recorded on their behalf.'],

        // -------------------------------------------------------- what exists

        // One answer for a missing route and a missing record, on purpose: a
        // caller able to tell them apart could enumerate which records exist.
        'not_found' => [404, 'No such route, or no such record.'],

        'method_not_allowed' => [405, 'The route exists, but not for this HTTP method. Check whether it '
            .'expects PUT or PATCH rather than POST.'],

        // ----------------------------------------------- sending it only once

        'idempotency_key_required' => [400, 'Public submissions must carry an `Idempotency-Key` header, so '
            .'that resending one after a timeout cannot book or send it twice. Generate a UUID when '
            .'the form is rendered and reuse it for every attempt at that submission.'],

        'idempotency_key_invalid' => [400, 'The `Idempotency-Key` must be 16 to 255 printable ASCII '
            .'characters. A UUID is the expected shape. These endpoints are anonymous, so a short '
            .'key collides with other callers\' keys.'],

        // One code for two cases: a key reused for a different body, and a key
        // whose first request is still running. For the caller both mean the
        // key is not theirs to use, and splitting them would reveal another
        // request on an anonymous endpoint.
        'idempotency_key_reuse' => [409, 'This `Idempotency-Key` belongs to a different submission, or to '
            .'one still being processed. Use a fresh key for a new submission, and wait before '
            .'retrying an attempt that has not answered yet.'],

        // ------------------------------------------ working from current state

        // Names the header and the read that produces one, so the caller knows
        // where a tag comes from.
        'if_match_required' => [428, 'This request replaces or removes something, so it must prove it is '
            .'working from the current state. Read the thing first and send the `ETag` it returns '
            .'back as `If-Match`. Attendance answers are exempt.'],

        // Neither the detail nor the response carries the current tag (see
        // App\Http\Middleware\ConditionalWrite). Handing it over would let a
        // client retry blindly and make the overwrite this refusal prevents.
        'if_match_failed' => [412, 'Somebody else changed this since you read it, so the write was '
            .'refused rather than silently discarding their change. Read it again, decide what you '
            .'still want to write, and retry with the new `ETag`.'],

        // ---------------------------------- allowed, but not against this state

        'cannot_delete_self' => [409, 'An account cannot delete itself. Ask another member who holds '
            .'members.manage to do it.'],

        // Refused because taking members.manage from yourself can lock the band
        // out of its own roster, and this host has no shell to repair it. The
        // caller only needs to know who to ask.
        'cannot_demote_self' => [409, 'An account cannot remove its own members.manage or roles.manage '
            .'permission. Ask another administrator.'],

        'cannot_remove_last_administrator' => [409, 'This change would leave nobody able to administer '
            .'members. Grant members.manage to somebody else first.'],

        // The same refusal for the role editor's own permission. Its own code,
        // because "grant members.manage to somebody" would send the caller to
        // fix the wrong thing.
        'cannot_remove_last_role_administrator' => [409, 'This change would leave nobody able to manage '
            .'roles. Grant roles.manage to somebody else first.'],

        // One code for removing, editing and deleting it, because the answer
        // to all three is the same: leave it alone.
        'baseline_role_is_fixed' => [409, 'The baseline role (`isBaseline` in GET /api/v1/roles) belongs to '
            .'every account and grants a fixed set of permissions. Keep it in every `roleIds`; it '
            .'cannot be edited or deleted.'],

        // The reason, kept out of the body, is mustChangePassword: a
        // committee-issued password has been read out loud, so "changing" it to
        // itself would clear the forced-change flag on a credential somebody
        // else has heard.
        'password_unchanged' => [409, 'The new password is the one the account is already using. Choose a '
            .'different one; nothing was changed.'],

        // A member answering for themselves owes a reason when withdrawing a
        // yes, and the on-behalf route is exempt, so aiming it at yourself would
        // get around that. The body does not describe the bypass.
        'cannot_record_for_self' => [409, 'This endpoint records an answer on another member\'s behalf and '
            .'was aimed at you. Use PUT /api/v1/events/{event}/attendance for your own answer.'],

        'answer_already_settled' => [409, 'An answer can only be withdrawn within five minutes of being '
            .'recorded. Change it instead. `recordedAt` on the answer tells you whether that window '
            .'is still open.'],

        'registration_not_open' => [409, 'Bookings for this event have not opened yet. '
            .'GET /api/v1/events/{event}/registration reports when they do.'],

        'registration_closed' => [409, 'Bookings for this event have closed. Those already taken are '
            .'unaffected.'],

        'event_incomplete' => [422, 'The event cannot be published yet. `errors` names each field that is missing or, for `endsAt`, '
            .'not after the start; fix them and publish again.'],

        'event_not_published' => [409, 'This event is still a draft, so it takes no answers. Publish it first.'],

        'event_has_answers' => [409, 'Members have already answered or booked this event, so it cannot go back to '
            .'draft: their answers would sit on an event nobody else can see.'],

        'option_has_registrations' => [409, 'That option has already been booked, so it cannot be deleted. '
            .'Cancel the bookings that reference it first.'],

        'option_shape_locked' => [409, 'Somebody has already answered that block, so its kind and whether it '
            .'counts people cannot change. Add a new block instead.'],

        'choice_answer_in_use' => [409, 'Somebody has picked that answer, so it cannot be removed. Rename it, '
            .'or cancel the bookings that chose it first.'],

        'register_in_use' => [409, 'Somebody plays in or teaches this register, so it cannot be deleted. '
            .'`playerCount` and `instructorCount` on GET /api/v1/sections/{section} say how many; give each '
            .'of them another register first.'],

        'registers_changed' => [409, 'The order does not name every register exactly once, so somebody added '
            .'or deleted one meanwhile. Read GET /api/v1/sections again and send the whole list.'],

        'image_in_use' => [409, 'This image is still shown somewhere on the site, so it cannot be deleted. '
            .'`usages` on GET /api/v1/images/{image} lists where; remove it from each place first.'],

        'image_already_in_library' => [409, 'Another image in the library already holds this photo, so it cannot '
            .'replace this one. Use that image instead, or delete it first.'],

        'image_library_full' => [409, 'The image library is full. Delete an image nothing uses, then upload '
            .'again. GET /api/v1/images/summary reports the count and the capacity.'],

        // ----------------------------------------------- the submission itself

        // Must stay vague: it must not tell a script which of the public-write
        // guard's three checks (the form token, the empty `website` field, the
        // minimum age) it failed. A legitimate integrator finds them in the
        // reference's "Public forms" section.
        'spam_suspected' => [422, 'The submission was refused. Reload the form and send it again. Public '
            .'forms require a form token — see Public forms in the API reference.'],
        'history_entry_empty' => [422, 'A history entry needs at least one of `titleFr`, `bodyFr`, '
            .'`titleDe` or `bodyDe`. Blank text counts as none.'],

        // --------------------------------------------------- the server itself

        'service_unavailable' => [503, 'The service is temporarily refusing requests. Retry shortly; '
            .'nothing on your side needs changing.'],

        // 507 rather than 503: the database refused the bytes for want of
        // room, which retrying will not change. Somebody has to free space or
        // raise the host's quota first.
        'image_storage_full' => [507, 'The database has no room for this photo. Retrying will not help '
            .'until space is freed: delete photos nothing uses, or ask whoever runs the server.'],

        'xlsx_unavailable' => [503, 'This server cannot build spreadsheet exports. Request the csv format '
            .'instead.'],
    ];

    /**
     * The `reason` tokens an `errors[]` entry can carry.
     *
     * A code says what went wrong with the request, a reason what went wrong
     * with one field. Both need French in web/src/i18n/fr.ts, and
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
        // StoreRegistrationRequest::after(), against `choices`.
        'too_many_guests',
        // StoreRegistrationRequest::after(): `no_guests` against `choices`
        // when blocks count people and add up to nobody, `not_an_answer`
        // against `choices.N.value` for a value its block does not take.
        'no_guests',
        'not_an_answer',
        // RegistrationController, against `choices.N.quantity`, when an
        // option's capacity has fewer places left.
        'not_enough_places',
        // ReplaceRegistrationOptionsRequest::after(), against
        // `options.N.answers`, for a choice with one answer.
        'too_few_answers',
        // What ReceivesImageSizes::after() adds against `files.N` and `files`.
        ...JpegInspector::PROBLEMS,
        ...ImageSet::PROBLEMS,
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
     * Null is unreachable in practice, since ApiErrorVocabularyTest asserts this
     * list and the codes app/ emits match exactly. It is modelled anyway so a
     * code added mid-change cannot cause a 500 while rendering an error.
     * ApiError then omits the member; RFC 9457 makes `detail` optional.
     */
    public static function detailFor(string $code): ?string
    {
        return self::PROBLEMS[$code][1] ?? null;
    }

    /**
     * The HTTP status a code is emitted with, or null for one this list does
     * not describe.
     *
     * Null is unreachable for the same reason as in detailFor(), and modelled
     * so a code added mid-change cannot make the document export fatal.
     */
    public static function statusFor(string $code): ?int
    {
        return self::PROBLEMS[$code][0] ?? null;
    }
}

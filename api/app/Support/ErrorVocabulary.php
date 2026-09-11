<?php

namespace App\Support;

/**
 * Every problem type this API can answer with, and what each one means.
 *
 * THREE READERS, ONE LIST. This feeds the `code` enum in the exported OpenAPI
 * document, the endpoint at /api/problems, and
 * Tests\Feature\ApiErrorVocabularyTest. Adding a token in one place makes it
 * appear in all three.
 *
 * IT IS CHECKED AGAINST THE SOURCE, not trusted. ApiErrorVocabularyTest scans
 * app/ for every `::json(<status>, '<code>'` literal and asserts the two sets
 * match exactly — so a developer who emits a new code without documenting it
 * here fails a test, and a stale entry for a code nobody emits fails the same
 * test from the other side. That derivation is what makes this list a
 * description of the API rather than a wish about it.
 *
 * `detail` is documentation, not a response member: ApiError never sends it.
 * It is what /api/problems/{code} serves, and it is where the things a status
 * code cannot say are written down — above all the pairs of codes that look
 * interchangeable and are not. English, like every other machine-facing string
 * here; the French a member reads lives in web/src/i18n/fr.ts, keyed by the
 * same token.
 */
final class ErrorVocabulary
{
    /**
     * The namespace every `type` is built under.
     *
     * A URN, and it is deliberately NOT FETCHABLE. `type` has exactly one job —
     * identify the problem type, which RFC 9457 calls the primary identifier a
     * consumer branches on — and a URN does that job while promising nothing
     * else. Identifier and locator are separate concerns, and conflating them
     * is what made every earlier attempt here wrong:
     *
     *   An absolute https://lescanetons.org/problems/... URL never resolved on
     *   a developer's machine, and — worse — a server running a newer build
     *   emits codes production does not have, so its errors pointed at a
     *   production page that 404s for a type which genuinely exists on the
     *   machine that answered.
     *
     *   A relative /api/problems/... URL fixed that by being served from an
     *   endpoint of its own, at the cost of a controller, two routes, a test
     *   file, an ongoing "should it be versioned" question, and a second human
     *   surface for words that already live in the Scalar reference.
     *
     * A URN has none of those failure modes because it makes no promise to
     * resolve: it cannot 404, cannot differ between environments, cannot drift,
     * and needs no route. What a human clicks is DOCUMENTATION below, carried
     * on the same document — the locator, free to move, because nothing
     * branches on it.
     *
     * Strictly, RFC 8141 wants an IANA-registered namespace identifier and
     * `lescanetons` is not one; an unregistered NID is very widely used in
     * practice, and `tag:lescanetons.org,2026:problem/...` (RFC 4151) is the
     * pedantically correct alternative if that ever matters.
     *
     * UNVERSIONED, and with a URN that is free rather than argued for. A
     * problem type outlives a contract version — `not_found` means the same
     * thing in v1 and v2 — and clients branch on this, so it can never change
     * once anything depends on it.
     */
    public const TYPE_BASE = 'urn:lescanetons:problem:';

    /**
     * Where a human reads these. Carried on every problem document.
     *
     * This is the locator half of the pair, and it exists because `type` is
     * deliberately unfetchable: a developer who wants prose needs somewhere to
     * click, and it should not be `type`. The Scalar reference renders the
     * whole vocabulary from the same source — see markdown() below — as a
     * sidebar group.
     *
     * The fragment is Scalar's own heading slug, the one string here their
     * upgrade could invalidate. Used anyway because the failure is SOFT: a
     * stale fragment still lands the reader on the reference and merely fails
     * to scroll. `type` could not take that risk; this can, which is precisely
     * why the two are separate members.
     */
    public const DOCUMENTATION = '/api/docs#description/problem-types';

    /**
     * code => [status, title, detail]
     *
     * @var array<string, array{int, string, string}>
     */
    public const PROBLEMS = [

        // ---------------------------------------------------------- the form

        'validation_failed' => [400, 'Invalid form submission',
            'One or more submitted fields were rejected. `errors` names each one '
            .'and why, as machine tokens: read `errors[].field` and `errors[].reason` '
            .'rather than `title`. A `reason` carries `params` when its sentence '
            .'needs a number, for example `{"max": 255}`.'],

        // ------------------------------------------------------ who you are

        'not_authenticated' => [401, 'Not authenticated',
            'No session cookie was sent, or it has expired. Call POST /api/v1/login. '
            .'This is NOT the same as 419 invalid_session, which means you are still '
            .'logged in and only the CSRF token needs re-priming — retrying a login '
            .'there is the wrong move.'],

        'invalid_credentials' => [401, 'Incorrect username or password',
            'The username does not exist, or the password is wrong. Deliberately the '
            .'same answer for both, so this endpoint cannot be used to discover which '
            .'accounts exist.'],

        'invalid_session' => [419, 'Invalid session',
            'A mutating request arrived without a valid X-XSRF-TOKEN header. You are '
            .'still logged in: call GET /sanctum/csrf-cookie and retry the request. '
            .'Sending the user back to the login screen on this code is a bug, and a '
            .'common one.'],

        'too_many_attempts' => [429, 'Too many attempts',
            'Rate limited after repeated failures. Applies to logging in and to '
            .'re-entering your own password. Attempts made while locked out do not '
            .'extend the lockout, and a correct password during it is still refused.'],

        'reauth_failed' => [403, 'Password confirmation failed',
            'The current password sent alongside a sensitive change was wrong. The '
            .'session is untouched and still valid — this is a re-proof of identity, '
            .'not a session failure.'],

        // ------------------------------------------- what you are allowed to do

        'access_denied' => [403, 'Access denied',
            'You are authenticated but hold no role granting the permission this route '
            .'requires. Permissions are the only thing enforced; role names are not. '
            .'GET /api/v1/me returns the caller\'s effective permissions.'],

        'not_answerable' => [403, 'Not answerable for this event',
            'Only members who play in a register are asked to answer for events, and '
            .'this member is in none. A 403 that is NOT about a missing permission: '
            .'there is no permission for answering, and no grant would change this. '
            .'Somebody who organises but does not play is the ordinary case.'],

        // ------------------------------------------------ what exists

        'not_found' => [404, 'Not found',
            'No such route, or no such record. One answer for both on purpose: '
            .'distinguishing them would let a caller enumerate which records exist, '
            .'which is exactly what a 404 is for.'],

        'method_not_allowed' => [405, 'Method not allowed',
            'The route exists but not for this HTTP method. Usually a POST where the '
            .'API expects PUT or PATCH.'],

        // ----------------------------------- allowed, but not against this state

        'cannot_delete_self' => [409, 'You cannot delete your own account',
            'Refused regardless of permission. Removing yourself is the one deletion '
            .'nobody can undo from the outside, because the account that would repair '
            .'it is the one being removed.'],

        'cannot_demote_self' => [409, 'You cannot remove your own administration rights',
            'Refused regardless of permission. Taking members.manage from yourself is '
            .'the fastest way to lock the band out of its own roster, and this host '
            .'has no shell to repair it with.'],

        'cannot_remove_last_administrator' => [409, 'This is the last member who can administer members',
            'The write would leave nobody holding members.manage. Grant it to somebody '
            .'else first. The same guard covers deleting that member and stripping '
            .'their roles.'],

        'cannot_record_for_self' => [409, 'Use your own attendance endpoint',
            'An answer recorded on somebody\'s behalf was aimed at the caller. Use '
            .'PUT /api/v1/events/{event}/attendance instead. This matters for a member '
            .'who both plays and organises: answering for yourself through the on-behalf '
            .'route would sidestep the rule that withdrawing a yes costs a reason.'],

        'answer_already_settled' => [409, 'The undo window has closed',
            'An answer can be withdrawn entirely for five minutes after it was last '
            .'recorded; after that it can only be changed. `recordedAt` on the answer is '
            .'what tells a client whether to offer the undo, so this should be reachable '
            .'only by a client racing its own clock.'],

        'registration_not_open' => [409, 'Registration has not opened yet',
            'The event takes public bookings, but the window has not started. '
            .'GET /api/v1/events/{event}/registration reports `open` — computed by the '
            .'server, because the visitor\'s clock may be wrong — along with when it '
            .'starts.'],

        'registration_closed' => [409, 'Registration has closed',
            'The event takes public bookings and the window has ended. Bookings already '
            .'taken are unaffected.'],

        'option_has_registrations' => [409, 'That option has already been booked',
            'Deleting a bookable option somebody has ordered is refused rather than '
            .'silently rewriting what they ordered. Cancel the bookings that reference '
            .'it first.'],

        // ------------------------------------------------ the submission itself

        'spam_suspected' => [422, 'This submission looks automated',
            'A public form was submitted without a valid X-Form-Token header, or '
            .'without the empty `website` field, or faster than a person could fill it '
            .'in. Which check failed is deliberately not reported: naming it tells a '
            .'script how to pass next time, and a real person only needs to reload and '
            .'retry.'],

        // ---------------------------------------------------- the server itself

        'service_unavailable' => [503, 'Service unavailable',
            'The database schema is not known to be current, so the request was refused '
            .'rather than served against a possibly half-applied schema. Temporary, and '
            .'not something a client can fix — retry shortly.'],

        'xlsx_unavailable' => [503, 'XLSX export needs the PHP zip extension',
            'This server has no zip extension, so the spreadsheet export cannot be '
            .'built. Every other export format still works; request csv instead.'],
    ];

    /**
     * The `reason` tokens an `errors[]` entry can carry.
     *
     * Separate from the codes above because they answer a different question:
     * a code says what went wrong with the REQUEST, a reason what went wrong
     * with one FIELD. Both must have French in web/src/i18n/fr.ts, and
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
     * Every code, for the OpenAPI `code` enum.
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
     * The `type` a problem document carries for this code.
     *
     * The code goes in VERBATIM, underscores and all. The URL form needed a
     * hyphenated spelling — a URI path segment conventionally is — which meant
     * one token had two spellings and a pair of functions to convert between
     * them, plus a route that had to accept both so a developer typing the code
     * they could see was not met with a 404. A URN has no such convention, so
     * that entire seam is gone: `type` is the prefix plus the code, and the two
     * can be read off each other by eye.
     */
    public static function typeUri(string $code): string
    {
        return self::TYPE_BASE.$code;
    }

    /**
     * One problem type as a document, for /api/problems/{code}.
     *
     * Carries its own `type`, so the JSON is self-describing: a tool that
     * fetched one of these can match it against the `type` of a problem
     * document it holds without knowing how the URI is built.
     *
     * @return array{code: string, type: string, status: int, title: string, detail: string, documentation: string}|null
     */
    public static function describe(string $code): ?array
    {
        if (! self::has($code)) {
            return null;
        }

        [$status, $title, $detail] = self::PROBLEMS[$code];

        return [
            'code' => $code,
            'type' => self::typeUri($code),
            'status' => $status,
            'title' => $title,
            'detail' => $detail,
            'documentation' => self::DOCUMENTATION,
        ];
    }

    /**
     * The problem-type reference, as Markdown, for the OpenAPI document's
     * `info.description`.
     *
     * GENERATED RATHER THAN WRITTEN, so the reference a developer reads inside
     * the Scalar page and the pages at /api/problems are the same text from the
     * same list. A prose copy of this in the description is a copy that goes
     * stale the first time somebody adds a code, and does so silently — the
     * worst way for documentation to be wrong.
     *
     * Scalar parses the Markdown headings in info.description into its own
     * sidebar, so each `###` below becomes a navigable entry, rendered in its
     * theme and its dark mode. THIS IS THE HUMAN-READABLE HALF, and the reason
     * /api/problems serves data and no longer a page: a hand-built page cannot
     * be made to look like Scalar and stay looking like it across their
     * releases, whereas content inside the document cannot drift from the
     * renderer at all.
     */
    public static function markdown(): string
    {
        // Leading blank line: PHP drops the newline before a heredoc's closing
        // identifier, so without this the first `###` lands on the line
        // immediately after the prose that introduces it and Markdown renders
        // the two as one paragraph.
        $lines = [''];

        foreach (self::all() as $problem) {
            $lines[] = sprintf('### `%s`', $problem['code']);
            $lines[] = '';
            // The `type` as code, NOT as a link: it is a URN and resolves to
            // nothing by design. Rendering it as a link would recreate the
            // broken promise the URN exists to avoid — this section IS the
            // documentation those identifiers refer to.
            $lines[] = sprintf(
                '**%d** · `%s` · `%s`',
                $problem['status'],
                $problem['title'],
                $problem['type'],
            );
            $lines[] = '';
            $lines[] = $problem['detail'];
            $lines[] = '';
        }

        return rtrim(implode("\n", $lines));
    }

    /**
     * Every problem type, in declaration order, for GET /api/problems.
     *
     * Declaration order is grouped by what the reader is asking about — the
     * form, who you are, what you may do, what exists, state conflicts, the
     * server — rather than alphabetically or by status, because an index is
     * read by somebody who does not yet know which code they want.
     *
     * @return list<array{code: string, type: string, status: int, title: string, detail: string, documentation: string}>
     */
    public static function all(): array
    {
        return array_values(array_filter(array_map(
            static fn (string $code): ?array => self::describe($code),
            self::codes(),
        )));
    }
}

<?php

namespace App\Support;

/**
 * Every problem type this API can answer with, and what each one means.
 *
 * THREE READERS, ONE LIST. This feeds the `code` enum in the exported OpenAPI
 * document, the *Problem types* section of the reference, and
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
 * It is rendered into the reference by markdown() below, and it is where the
 * things a status code cannot say are written down — above all the pairs of
 * codes that look interchangeable and are not. English, like every other
 * machine-facing string here; the French a member reads lives in
 * web/src/i18n/fr.ts, keyed by the same token.
 */
final class ErrorVocabulary
{
    /**
     * Where a human reads about one problem type. Carried on every problem
     * document, per code.
     *
     * THIS IS THE ONLY POINTER THE CONTRACT CARRIES, and it replaced a `type`
     * member that went through three designs before being deleted outright.
     * André's argument ended it: `type` was always this namespace plus the
     * `code`, so it carried exactly zero information that `code` did not. A
     * constant prefix on a value you already have is not an identifier, it is
     * ceremony.
     *
     * The same objection nearly sank this member too — it pointed at one
     * section for every error, which is no more useful than no link. It is
     * per-code now, and that is what earns its place: `documentation` says
     * where to read about THIS problem, which is the one thing `type` never
     * did.
     *
     * The slug is Scalar's own, derived from the `###` heading that
     * markdown() writes. That coupling is acceptable HERE and would not have
     * been on `type`: this is a locator, so a stale slug fails softly — the
     * reader still lands on the reference and merely fails to scroll — whereas
     * a broken identifier breaks a client's branching. Which member may depend
     * on a third party's slugifier is exactly the identifier/locator
     * distinction, made concrete.
     */
    public const DOCUMENTATION_BASE = '/api/docs#description/';

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
     * Where this particular problem type is documented.
     *
     * Hyphenated, because that is what Scalar's slugifier makes of the `###`
     * heading markdown() writes — measured, not assumed. Getting it wrong is a
     * soft failure: the reader lands on the reference and does not scroll.
     */
    public static function documentationFor(string $code): string
    {
        return self::DOCUMENTATION_BASE.str_replace('_', '-', $code);
    }

    /**
     * One problem type as a document, for /api/problems/{code}.
     *
     * Carries its own `type`, so the JSON is self-describing: a tool that
     * fetched one of these can match it against the `type` of a problem
     * document it holds without knowing how the URI is built.
     *
     * @return array{code: string, status: int, title: string, detail: string, documentation: string}|null
     */
    public static function describe(string $code): ?array
    {
        if (! self::has($code)) {
            return null;
        }

        [$status, $title, $detail] = self::PROBLEMS[$code];

        return [
            'code' => $code,
            'status' => $status,
            'title' => $title,
            'detail' => $detail,
            'documentation' => self::documentationFor($code),
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
            // NO BACKTICKS around the code, and that is load-bearing rather
            // than a style choice. Scalar builds each heading's route from the
            // heading's PLAIN TEXT; wrapped in a code span there is none, so
            // every one of these collapsed to the same empty slug
            // (`api-1/description/`) and none of them was addressable. Measured
            // in a browser — `### Why a cookie rather than a token` two
            // sections above routes correctly, which is what made the
            // difference visible.
            $lines[] = sprintf('### %s', $problem['code']);
            $lines[] = '';
            // No link here: this section IS what `documentation` points at,
            // so linking each entry to itself would be circular.
            $lines[] = sprintf('**%d** · `%s`', $problem['status'], $problem['title']);
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
     * @return list<array{code: string, status: int, title: string, detail: string, documentation: string}>
     */
    public static function all(): array
    {
        return array_values(array_filter(array_map(
            static fn (string $code): ?array => self::describe($code),
            self::codes(),
        )));
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A new person on the roster, which is also a new account: every member has a
 * login.
 *
 * `username` is therefore required, must be unique, and may hold only lower
 * case letters, digits, dot, hyphen and underscore. It gets dictated over the
 * phone, so it is deliberately narrow.
 *
 * There is no `password` field. The API generates one and returns it in the
 * response exactly once, for an administrator to pass on; it is never
 * retrievable afterwards.
 *
 * There is no `roleIds` field either. A new member starts with no roles and
 * no permissions; granting any is a separate call to
 * `PUT /api/v1/members/{member}/roles`.
 *
 * `sectionId` is the register the member plays in. A member with no register
 * is not answerable for events and never appears in an attendance list, which
 * is how somebody who organises but does not play is recorded.
 */
class StoreMemberRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // `username` is REQUIRED because every member has an account
        // (2026_09_08_000001). It used to be optional, back when a row could
        // be a person without a login; that model is what let somebody hold
        // members.manage while being unable to authenticate, and deleting the
        // only real administrator then locked the band out.
        //
        // There is deliberately no `roleIds` field: granting a permission is
        // exactly one operation, PUT /members/{member}/roles, which checks the
        // lockout invariants and ends the member's sessions. Accepting roles
        // here would let a stolen session create a working administrator in
        // one call.
        //
        // There is deliberately no `password` field. The password is GENERATED
        // by the controller and returned once — an administrator reads it down
        // the phone (§4.4) — so nobody types a credential into this form and
        // no weak one can be chosen.
        //
        // Field names are camelCase, matching what the SPA sends and what
        // App\Exceptions\ApiError echoes into fields[].field, where
        // web/src/i18n/fr.ts looks them up. Renaming one silently breaks its
        // French error message.
        //
        // RULE ORDER IS LOAD-BEARING: ApiError reports only the FIRST failed
        // rule per field, so `required` comes first (an empty field reports
        // `required`, not `invalid_format`) and `max` precedes `unique` (an
        // over-long username reports `too_long` rather than costing a database
        // round-trip).
        return [
            'firstName' => ['required', 'string', 'max:255'],
            'lastName' => ['required', 'string', 'max:255'],

            // Lower case, digits, dot, hyphen, underscore. The seeded logins
            // look like `demo.direction`, and a username that has to be
            // dictated should not depend on capitalisation. The column collates
            // case-insensitively anyway, so `Lea` and `lea` would be the same
            // account — the rule makes that visible rather than surprising.
            /** The login, unique across the roster. Lower case letters, digits, dot, hyphen and underscore only, for example `marie.dupont`. */
            'username' => ['required', 'string', 'max:255', 'regex:/^[a-z0-9._-]+$/', 'unique:members,username'],

            /** The register the member plays in, from `GET /api/v1/sections`. Null for somebody who organises but does not play; they are then never listed for attendance. */
            'sectionId' => ['nullable', 'integer', 'exists:sections,id'],
            /** The member's function on the committee, shown on the public committee page. Free text, null for most members. */
            'committeeTitle' => ['nullable', 'string', 'max:255'],
            /** The register this member instructs, if any. Separate from `sectionId`: an instructor need not play in the register they teach. */
            'instructorOfSectionId' => ['nullable', 'integer', 'exists:sections,id'],

            // Required, not defaulted: publication of a minor's name is a
            // decision somebody makes, so the form has to state it rather than
            // inherit it.
            /** Whether the member's name may appear on the public site. Required rather than defaulted, because many members are minors and this is decided per person. */
            'publicVisible' => ['required', 'boolean'],
        ];
    }
}

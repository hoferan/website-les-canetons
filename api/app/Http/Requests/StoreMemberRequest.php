<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A new person on the roster, which is also a new account: every member has a
 * login.
 *
 * `username` is therefore required, must be unique, and may hold only lower
 * case letters, digits, dot, hyphen and underscore, because it gets dictated
 * over the phone.
 *
 * There is no `password` field. The API generates one and returns it in the
 * response exactly once, for an administrator to pass on; it is never
 * retrievable afterwards.
 *
 * There is no `roleIds` field either. A new member starts with only the
 * baseline role, which every account holds; any other role is a separate call
 * to `PUT /api/v1/members/{member}/roles`.
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
        // `username` is required because every member has an account: a
        // member without a login could hold members.manage and be unable to
        // authenticate. It allows only lower case, digits, dot, hyphen and
        // underscore because it is dictated over the phone, and the column
        // collates case-insensitively, so `Lea` and `lea` would be one account.
        //
        // No `roleIds`: granting a permission is one operation,
        // PUT /members/{member}/roles, which checks the lockout invariants and
        // ends the member's sessions. Accepting roles here would let a stolen
        // session create an administrator in one call.
        //
        // No `password`: the controller generates one and returns it once for
        // an administrator to read out (ADR 0016), so no weak one can be
        // chosen.
        //
        // App\Exceptions\ApiError echoes these field names into errors[].field,
        // where web/src/i18n/fr.ts looks them up, so renaming one breaks its
        // translated error message.
        //
        // Rule order matters: ApiError reports only the first failed rule per
        // field, so `required` comes first (an empty field reports `required`,
        // not `invalid_format`) and `max` precedes `unique` (an over-long
        // username reports `too_long` without a database round trip).
        //
        // `publicVisible` is required, not defaulted, because publishing a
        // minor's name is a decision somebody has to state.
        return [
            'firstName' => ['required', 'string', 'max:255'],
            'lastName' => ['required', 'string', 'max:255'],

            /** The login, unique across the roster. Lower case letters, digits, dot, hyphen and underscore only, for example `marie.dupont`. */
            'username' => ['required', 'string', 'max:255', 'regex:/^[a-z0-9._-]+$/', 'unique:members,username'],

            /** The register the member plays in, from `GET /api/v1/sections`. Null for somebody who organises but does not play; they are then never listed for attendance. */
            'sectionId' => ['nullable', 'integer', 'exists:sections,id'],
            /** The seat the member holds on the committee, from `GET /api/v1/committee-functions`. Null for most members, who hold none and do not appear on the public committee page. */
            'committeeFunctionId' => ['nullable', 'integer', 'exists:committee_functions,id'],
            /** The register this member instructs, if any. Separate from `sectionId`: an instructor need not play in the register they teach. */
            'instructorOfSectionId' => ['nullable', 'integer', 'exists:sections,id'],

            /** Whether the member's name may appear on the public site. Required rather than defaulted, because many members are minors and this is decided per person. */
            'publicVisible' => ['required', 'boolean'],
        ];
    }
}

<?php

namespace App\Http\Requests;

use App\Models\Member;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Changes to a person already on the roster.
 *
 * A PATCH: send only the fields that change. An omitted field is left as it
 * is, and an explicit `null` clears one of the optional fields.
 *
 * `username` is the exception. It may be changed but not cleared, because it
 * is the login and every member has one. It keeps the same shape as at
 * creation, and must stay unique across the roster.
 *
 * Roles are not here: replacing them is `PUT /api/v1/members/{member}/roles`,
 * which checks the roster's lockout invariants and ends the member's open
 * sessions. Neither is the password, which has its own endpoint.
 */
class UpdateMemberRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // PATCH, so every rule is `sometimes`: a form that posts only the
        // field it changed must not blank the others.
        //
        // `sometimes` skips an absent field; `nullable` makes null legal when
        // present. The nullable columns need both, because clearing a register
        // is an explicit null. `username` is `sometimes` but not `nullable`:
        // every member has a login.
        //
        // Roles are not here: PUT /api/v1/members/{member}/roles has its own
        // invariant check and revokes the member's sessions, which this
        // general edit has neither of. The password has its own endpoint too.
        //
        // Null-safe: ApiErrorVocabularyTest instantiates every FormRequest
        // outside a request to read its rules() keys, with no bound route
        // model.
        /** @var Member|null $member */
        $member = $this->route('member');

        return [
            'firstName' => ['sometimes', 'required', 'string', 'max:255'],
            'lastName' => ['sometimes', 'required', 'string', 'max:255'],

            /** The login. May be changed but never cleared. Lower case letters, digits, dot, hyphen and underscore only, and unique across the roster. */
            'username' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                'regex:/^[a-z0-9._-]+$/',
                // Ignores the row being edited, which holds its own username.
                Rule::unique('members', 'username')->ignore($member?->id),
            ],

            /** The register the member plays in, from `GET /api/v1/sections`. Send `null` to take them out of every register, which also takes them off attendance lists. */
            'sectionId' => ['sometimes', 'nullable', 'integer', 'exists:sections,id'],
            /** The seat the member holds on the committee, from `GET /api/v1/committee-functions`. Send `null` to take them off the committee. */
            'committeeFunctionId' => ['sometimes', 'nullable', 'integer', 'exists:committee_functions,id'],
            /** The register this member instructs, if any. Send `null` to clear it. */
            'instructorOfSectionId' => ['sometimes', 'nullable', 'integer', 'exists:sections,id'],
            /** Whether the member's name may appear on the public site. */
            'publicVisible' => ['sometimes', 'boolean'],
        ];
    }
}

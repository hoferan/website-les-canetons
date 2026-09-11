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
        // `sometimes` is not the same as `nullable`, and both are needed on
        // the nullable columns — `sometimes` means "skip this field if
        // absent", `nullable` means "null is a legal value when present".
        // Without `sometimes` an absent field fails `required`; without
        // `nullable` an explicit null fails the type rules. Clearing a
        // register is an explicit null, so both matter.
        //
        // `username` is the one field that is `sometimes` but NOT `nullable`:
        // it is the login, and every member has one. Clearing it used to be
        // allowed, and used to require clearing the password and ending the
        // sessions with it — an entire branch that 2026_09_08_000001 deleted
        // by making the column NOT NULL.
        //
        // ROLES ARE NOT HERE. Replacing them is PUT
        // /api/v1/members/{member}/roles, which has its own invariant check and
        // revokes every session the member holds; folding it into the general
        // edit would put a privilege change behind a form that has neither.
        // Neither is the password: that is its own endpoint, and its own
        // dialog.
        //
        // Null-safe deliberately. ApiErrorVocabularyTest instantiates every
        // FormRequest outside a request to read its rules() keys, so there is
        // no bound route model then and `$member->id` would warn. At runtime
        // route-model binding guarantees one.
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
                // ignore() the row being edited, or renaming somebody's surname
                // fails because their username is "already taken" by themselves.
                Rule::unique('members', 'username')->ignore($member?->id),
            ],

            /** The register the member plays in, from `GET /api/v1/sections`. Send `null` to take them out of every register, which also takes them off attendance lists. */
            'sectionId' => ['sometimes', 'nullable', 'integer', 'exists:sections,id'],
            /** The member's function on the committee. Send `null` to clear it. */
            'committeeTitle' => ['sometimes', 'nullable', 'string', 'max:255'],
            /** The register this member instructs, if any. Send `null` to clear it. */
            'instructorOfSectionId' => ['sometimes', 'nullable', 'integer', 'exists:sections,id'],
            /** Whether the member's name may appear on the public site. */
            'publicVisible' => ['sometimes', 'boolean'],
        ];
    }
}

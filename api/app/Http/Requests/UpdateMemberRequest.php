<?php

namespace App\Http\Requests;

use App\Models\Member;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Editing a person on the roster.
 *
 * PATCH, so every rule is `sometimes`: a form that posts only the field it
 * changed must not blank the others.
 *
 * `sometimes` is not the same as `nullable`, and both are needed on the
 * nullable columns — `sometimes` means "skip this field if absent", `nullable`
 * means "null is a legal value when present". Without `sometimes` an absent
 * field fails `required`; without `nullable` an explicit null fails the type
 * rules. Clearing a register is an explicit null, so both matter.
 *
 * `username` is the one field that is `sometimes` but NOT `nullable`: it is the
 * login, and every member has one. Clearing it used to be allowed, and used to
 * require clearing the password and ending the sessions with it — an entire
 * branch that 2026_09_08_000001 deleted by making the column NOT NULL.
 *
 * ROLES ARE NOT HERE. Replacing them is PUT /api/members/{member}/roles, which
 * needs re-authentication and its own invariant check; folding it into the
 * general edit would put a privilege change behind a form that has neither.
 * Neither is the password: that is its own endpoint, and its own dialog.
 */
class UpdateMemberRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // Null-safe deliberately. ApiErrorVocabularyTest instantiates every
        // FormRequest outside a request to read its rules() keys, so there is
        // no bound route model then and `$member->id` would warn. At runtime
        // route-model binding guarantees one.
        /** @var Member|null $member */
        $member = $this->route('member');

        return [
            'firstName' => ['sometimes', 'required', 'string', 'max:255'],
            'lastName' => ['sometimes', 'required', 'string', 'max:255'],

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

            'sectionId' => ['sometimes', 'nullable', 'integer', 'exists:sections,id'],
            'committeeTitle' => ['sometimes', 'nullable', 'string', 'max:255'],
            'instructorOfSectionId' => ['sometimes', 'nullable', 'integer', 'exists:sections,id'],
            'publicVisible' => ['sometimes', 'boolean'],
        ];
    }
}

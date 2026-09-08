<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Replacing one member's roles.
 *
 * PUT SEMANTICS: `roleIds` is the complete set the member will be left with,
 * and an empty array means "no roles". That is deliberate — a PATCH-style "add
 * this one" API cannot express removal, and removal is the half that needs the
 * invariants.
 *
 * `roleIds` is `present`, not `required`: `required` rejects an empty array,
 * which is the most important value this endpoint accepts.
 */
class ReplaceMemberRolesRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'roleIds' => ['present', 'array'],
            'roleIds.*' => ['integer', 'exists:roles,id'],

            // Re-authentication. Verified by App\Support\Reauthentication in
            // the controller, before anything is read or written.
            'currentPassword' => ['required', 'string'],
        ];
    }
}

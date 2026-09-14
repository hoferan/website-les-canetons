<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The complete set of roles a member is to be left with.
 *
 * This is a replacement, not a partial update: send every role the member
 * should hold afterwards, including the ones they already have. Anything left
 * out is removed, and an empty array removes all of them.
 *
 * `roleIds` must be sent, even when empty. Read the ids that exist from
 * `GET /api/v1/roles`; an unknown one fails validation against `roleIds`.
 */
class ReplaceMemberRolesRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // PUT SEMANTICS: a PATCH-style "add this one" API cannot express
        // removal, and removal is the half that needs the invariants.
        //
        // `roleIds` is `present`, not `required`: `required` rejects an empty
        // array, which is the most important value this endpoint accepts.
        return [
            /** Every role the member should hold afterwards. Send `[]` to leave them with none. */
            'roleIds' => ['present', 'array'],
            'roleIds.*' => ['integer', 'exists:roles,id'],
        ];
    }
}

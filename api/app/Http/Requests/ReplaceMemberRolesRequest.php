<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The complete set of roles a member is to be left with.
 *
 * This is a replacement, not a partial update: send every role the member
 * should hold afterwards, including the ones they already have. Anything left
 * out is removed, except the baseline role, which every account keeps: a list
 * without it is refused with `409 baseline_role_is_fixed`.
 *
 * Read the ids that exist from `GET /api/v1/roles`; an unknown one fails
 * validation against `roleIds`.
 */
class ReplaceMemberRolesRequest extends FormRequest
{
    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // A replacement, because an "add this one" API cannot express removal,
        // and removal is what needs the invariants.
        //
        // `roleIds` is `present`, not `required`: AccessIntegrity refuses an
        // empty array with a code a client can act on, where `required` would
        // only say the field is missing.
        return [
            /** Every role the member should hold afterwards, the baseline role included. */
            'roleIds' => ['present', 'array'],
            'roleIds.*' => ['integer', 'exists:roles,id'],
        ];
    }
}

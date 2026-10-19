<?php

namespace App\Http\Resources;

use App\Models\Member;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One person on the roster.
 *
 * Every member has an account and can log in (a young member's parent uses
 * the child's login). People the band only displays, such as instructors or
 * honorary members, are content and not in this table, so there is no
 * `hasAccount` field.
 *
 * There is no password field: the model's $hidden does not apply to a
 * Resource, so the protection is not reading $this->password here.
 * MemberIndexTest asserts the rendered body carries no hash.
 *
 * There is no permissions field either. This sends roleIds, GET /api/v1/roles
 * sends what each role grants, and the UI joins them. That keeps every
 * permission traceable to a role (ADR 0014) and the endpoint at a fixed number
 * of queries.
 *
 * The committee seat travels as an id, unlike the register's name: only the
 * form shows the seat, and it resolves it from GET /api/v1/committee-functions.
 * A name would be hashed into the member's entity tag, so renaming a seat
 * would move the tag of everybody holding it and refuse open edits.
 *
 * @mixin Member
 */
class MemberResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'firstName' => $this->first_name,
            'lastName' => $this->last_name,

            'username' => $this->username,
            /** True after a committee-issued password. Every screen but /account is blocked until they change it. */
            'mustChangePassword' => $this->must_change_password,
            'lastLoginAt' => $this->lastLoginAt(),

            'sectionId' => $this->section_id,
            'sectionName' => $this->section?->name,

            'committeeFunctionId' => $this->committee_function_id,
            'instructorOfSectionId' => $this->instructor_of_section_id,
            'publicVisible' => $this->public_visible,

            /** The roles they hold. Call GET /api/v1/roles to learn what each one grants. */
            'roleIds' => $this->roleIds(),
        ];
    }

    /**
     * A typed method, not an inline expression: an inline
     * `->pluck('id')->all()` types as {"type":"object","additionalProperties":{}}
     * in the OpenAPI document. The docblock makes it number[].
     *
     * @return list<int>
     */
    private function roleIds(): array
    {
        return $this->roles->pluck('id')->map(fn ($id): int => (int) $id)->values()->all();
    }

    /**
     * Typed for the same reason as roleIds().
     *
     * The ternary keeps it nullable in the document: Scramble reads the
     * expression rather than the signature, so a `?Iso8601` helper would
     * publish a required `string`, and a member who never logged in has null.
     */
    private function lastLoginAt(): ?Iso8601
    {
        return $this->last_login_at === null ? null : Iso8601::utc($this->last_login_at);
    }
}

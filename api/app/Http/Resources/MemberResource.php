<?php

namespace App\Http\Resources;

use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One person on the roster.
 *
 * A ROW IS A PERSON, NOT AN ACCOUNT, and this payload has to say so: `username`
 * and `hasAccount` are separate fields precisely because a person with neither
 * still belongs on the roster, still has a register, and can still be given an
 * account later.
 *
 * NO PASSWORD FIELD, AND NO PERMISSIONS FIELD.
 *
 * The password hash is absent because nothing may ever read it back. The
 * model's $hidden protects a directly-serialised model, but a Resource that
 * read $this->password would sail straight past it — so the protection here is
 * simply not writing the line, and MemberIndexTest asserts the rendered body
 * carries no hash.
 *
 * Permissions are absent because they are answered by the ROLE: this sends
 * roleIds, GET /api/roles sends what each role grants, and the UI joins them.
 * That is what keeps "why does she have this?" answerable — always "because she
 * is in Team Direction" (design §3) — and it keeps the endpoint at a fixed
 * number of queries instead of one per member.
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
            // Not the same question as "has a username": both credentials must
            // be present to log in, and the lockout invariants count only
            // people for whom that is true.
            'hasAccount' => $this->canAuthenticate(),
            'mustChangePassword' => $this->must_change_password,
            'lastLoginAt' => $this->lastLoginAt(),

            'sectionId' => $this->section_id,
            'sectionName' => $this->section?->name,
            // Whether they PLAY, which is the single fact that decides who is
            // answerable for an event. Derived from section_id rather than
            // stored, so the two can never disagree.
            'isPlayer' => $this->isPlayer(),

            // Text a person typed, so it is stored and rendered verbatim and is
            // never translated — unlike a role's name, which is a key.
            'committeeTitle' => $this->committee_title,
            'instructorOfSectionId' => $this->instructor_of_section_id,
            'publicVisible' => $this->public_visible,

            'roleIds' => $this->roleIds(),
        ];
    }

    /**
     * A typed method, not an inline expression. Measured 2026-09-07: an inline
     * `->pluck('id')->all()` types as {"type":"object","additionalProperties":{}}
     * in the OpenAPI document and arrives in TypeScript as an untyped object.
     * The docblock is what makes it number[].
     *
     * @return list<int>
     */
    private function roleIds(): array
    {
        return $this->roles->pluck('id')->map(fn ($id): int => (int) $id)->values()->all();
    }

    /** Typed for the same reason as roleIds(). */
    private function lastLoginAt(): ?string
    {
        return $this->last_login_at?->toIso8601String();
    }
}

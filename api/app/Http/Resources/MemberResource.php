<?php

namespace App\Http\Resources;

use App\Models\Member;
use App\Support\Iso8601;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One person on the roster.
 *
 * EVERY MEMBER HAS AN ACCOUNT (2026_09_08_000001). The roster is the people the
 * band tracks for events, and all of them can log in — a young member's parent
 * uses their login on their behalf. People the band merely displays, such as
 * instructors or honorary members, are CONTENT and are not in this table at
 * all, so there is no `hasAccount` question to answer.
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
 * roleIds, GET /api/v1/roles sends what each role grants, and the UI joins them.
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
            /** True after a committee-issued password. Every screen but /account is blocked until they change it. */
            'mustChangePassword' => $this->must_change_password,
            'lastLoginAt' => $this->lastLoginAt(),

            'sectionId' => $this->section_id,
            'sectionName' => $this->section?->name,
            // Whether they PLAY, which is the single fact that decides who is
            // answerable for an event. Derived from section_id rather than
            // stored, so the two can never disagree.
            /** Whether they play in a register. Only players are answerable for events. */
            'isPlayer' => $this->isPlayer(),

            // Text a person typed, so it is stored and rendered verbatim and is
            // never translated — unlike a role's name, which is a key.
            'committeeTitle' => $this->committee_title,
            'instructorOfSectionId' => $this->instructor_of_section_id,
            'publicVisible' => $this->public_visible,

            /** The roles they hold. Call GET /api/v1/roles to learn what each one grants. */
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

    /**
     * Typed for the same reason as roleIds().
     *
     * The ternary is what keeps it nullable in the document: Scramble reads the
     * expression rather than the signature, so a `?Iso8601` helper here would
     * publish a required `string` and every generated client would stop
     * expecting the null a member who has never logged in returns.
     */
    private function lastLoginAt(): ?Iso8601
    {
        return $this->last_login_at === null ? null : Iso8601::utc($this->last_login_at);
    }
}

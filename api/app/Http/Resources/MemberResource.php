<?php

namespace App\Http\Resources;

use App\Models\Member;
use App\Models\Role;
use App\Support\EffectivePermissions;
use App\Support\Iso8601;
use App\Support\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

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
 * is in Team Direction" (ADR 0014) — and it keeps the endpoint at a fixed
 * number of queries instead of one per member.
 *
 * @mixin Member
 */
class MemberResource extends JsonResource
{
    /** Request-attribute key for the roles granting attendance.respond. See answersEvents(). */
    private const ANSWERING_ROLES = 'answeringRoleIds';

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
            // attendance.respond under its old name, as on GET /me, until the
            // field goes (#192). The register beside it no longer decides it.
            /** Whether one of their roles grants `attendance.respond`, which is what makes a member answerable for events. Their register does not decide it. */
            'isPlayer' => $this->answersEvents($request),

            // THE ID, NOT THE NAME, unlike sectionName above. The roster
            // screen renders the register in its table and so needs the name
            // here; nothing renders the committee seat outside the form, which
            // resolves it from GET /api/v1/committee-functions. A name here
            // would also be hashed into the member's entity tag — so fixing a
            // typo in one seat would move the tag of everybody holding it and
            // refuse whatever roster edits were open at the time.
            'committeeFunctionId' => $this->committee_function_id,
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
     * Whether any role this member holds grants attendance.respond.
     *
     * From the roles already loaded for roleIds, against the roles granting
     * the permission, which are read ONCE per request and kept in its
     * attributes. Member::hasPermission() would be a query per row, and this
     * Resource renders the whole roster at the fixed query budget
     * MemberIndexTest pins.
     *
     * A bare request is fine here, unlike EventResource's gates. The answer
     * depends on the member alone, so EntityTag::state(), which renders
     * through a fresh Request, still hashes the right value.
     */
    private function answersEvents(Request $request): bool
    {
        if (! $request->attributes->has(self::ANSWERING_ROLES)) {
            $request->attributes->set(
                self::ANSWERING_ROLES,
                EffectivePermissions::roleIdsGranting(Permission::AttendanceRespond),
            );
        }

        /** @var Collection<int, int> $answering */
        $answering = $request->attributes->get(self::ANSWERING_ROLES);

        return $this->roles->contains(fn (Role $role): bool => $answering->contains((int) $role->id));
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

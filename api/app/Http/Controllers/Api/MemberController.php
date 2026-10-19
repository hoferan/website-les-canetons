<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMemberRequest;
use App\Http\Requests\UpdateMemberRequest;
use App\Http\Resources\MemberResource;
use App\Models\Member;
use App\Models\Role;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\Emits;
use App\Support\GeneratedPassword;
use App\Support\Search;
use App\Support\SessionRevoker;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

#[Group('Members', 'The roster, and the reference data a roster form needs. All of it behind `members.manage`.', weight: 50)]
class MemberController extends Controller
{
    /**
     * List the roster.
     *
     * Requires `members.manage`. Returns everyone the band tracks, ordered by
     * last name then first name. Each entry carries the person's register
     * (`sectionId` and `sectionName`), their committee title, whether they may
     * be shown on the public site, and `roleIds`, the roles they hold.
     *
     * No password and no hash is ever included, and neither are effective
     * permissions: a role is what grants them, so read `GET /api/v1/roles` and
     * join on `roleIds`. That is also how to tell who answers for events: the
     * roles granting `attendance.respond`, whatever the register says.
     *
     * Three optional filters narrow the roster, and combine when given
     * together. `q` matches a first name, a last name, a username, or the
     * whole name in either order, ignoring case and accents. `section` takes a
     * register id, or `none` for the members in no register. `role` takes a
     * role id. An id that names nothing matches nobody rather than failing,
     * and `meta.total` counts the matches, not the whole roster.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            /**
             * Text to find in a first name, a last name, a username, or the whole name.
             *
             * @example perrine
             */
            'q' => Search::RULES,
            /**
             * A register id, or `none` for the members in no register.
             *
             * @example 3
             */
            'section' => ['nullable', 'regex:/^([0-9]+|none)$/'],
            /**
             * A role id.
             *
             * @example 1
             */
            'role' => ['nullable', 'integer'],
        ]);

        // Ordered by name because this screen is scanned for a person.
        // Grouping by register is the UI's business, using sectionName.
        //
        // with() keeps the query count fixed; without it each member costs
        // three queries. Pinned by
        // MemberIndexTest::test_listing_the_roster_costs_a_fixed_number_of_queries.
        //
        // The filters are WHEREs on that one query (#97), so the budget holds
        // with any of them set. PaginatesCollections slices what comes back,
        // so a filter applied after the slice would search one page only.
        // Accent and case folding come from the collation (App\Support\Search).
        //
        // Assigned first so Scramble does not publish this comment as the 200
        // description; a blank line alone does not break the association.
        $roster = Member::with(['section', 'roles'])
            // isset() rather than when()'s own truthiness, which would read a
            // search for "0" as no search at all.
            ->when(isset($filters['q']), function ($query) use ($filters): void {
                $pattern = Search::contains($filters['q']);
                $query->where(fn ($match) => $match
                    ->where('first_name', 'like', $pattern)
                    ->orWhere('last_name', 'like', $pattern)
                    ->orWhere('username', 'like', $pattern)
                    // The whole name in either order: "perrine pl" and
                    // "player perr" both find her.
                    ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$pattern])
                    ->orWhereRaw("CONCAT(last_name, ' ', first_name) LIKE ?", [$pattern]));
            })
            ->when(isset($filters['section']), fn ($query) => $filters['section'] === 'none'
                ? $query->whereNull('section_id')
                : $query->where('section_id', (int) $filters['section']))
            ->when(isset($filters['role']), fn ($query) => $query
                ->whereHas('roles', fn ($held) => $held->whereKey((int) $filters['role'])))
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->get();

        return MemberResource::collection($roster);
    }

    /**
     * Read one person.
     *
     * Requires `members.manage`. The same fields the roster list carries, for
     * a single member.
     *
     * Read this before editing somebody, and quote the `ETag` it returns in
     * the `If-Match` header of the write. The list hands out no tag, since one
     * tag cannot validate every row, so a form filled from the list and
     * submitted without a read is the lost update this API refuses.
     */
    public function show(Member $member): MemberResource
    {
        // Loaded explicitly: the Resource publishes sectionName and roleIds,
        // and unloaded relations would cost two extra queries.
        //
        // Assigned first so Scramble does not publish this comment as the 200
        // description.
        $person = $member->load(['section', 'roles']);

        return new MemberResource($person);
    }

    /**
     * Add a member to the roster.
     *
     * Requires `members.manage`. Creating a person creates their account:
     * every member has one. Send `firstName`, `lastName`, `username` and
     * `publicVisible`, and optionally `sectionId`, `committeeFunctionId` and
     * `instructorOfSectionId`.
     *
     * Answers `201` with `member` and `generatedPassword`, a readable password
     * the server minted for the new account. It is shown in this response and
     * nowhere else: it is hashed on the way into the database, is never
     * written to the audit log, and no later call returns it. An administrator
     * who loses it issues a new one at
     * `POST /api/v1/members/{member}/password`. The new member is required to
     * change it before doing anything else.
     *
     * Only the baseline role is granted: every account holds it. Any other role
     * is `PUT /api/v1/members/{member}/roles`. No password may be chosen here.
     *
     * A missing required field answers `400 validation_failed` naming the
     * field with `required`. A username already in use answers the same with
     * `already_taken`; one containing anything but lower-case letters, digits,
     * dot, hyphen or underscore answers `invalid_format`.
     */
    #[Response(201, 'The new member, plus the generated password. It is shown once and never retrievable again.')]
    public function store(StoreMemberRequest $request): JsonResponse
    {
        // The password is minted here and returned once (ADR 0015, ADR 0016).
        // A member created without a usable credential could be granted
        // members.manage and become the last administrator, holding the
        // permission and unable to log in.
        //
        // It is the same dictatable value a reset produces, and
        // must_change_password is set, since a password read down the phone is
        // not a secret worth keeping.
        //
        // Only the baseline role is granted, from the role's marker and never
        // from the request. Any other role goes through
        // PUT /members/{member}/roles, which checks the lockout invariants,
        // ends the target's sessions and audits. Accepting roleIds here would
        // let a stolen session mint a `direction` member and read its password
        // from this response. The baseline cannot orphan administration or
        // demote anybody, so no AccessIntegrity check is needed.
        $data = $request->validated();
        $password = GeneratedPassword::make();

        $member = DB::transaction(function () use ($data, $password): Member {
            $member = Member::create([
                'first_name' => $data['firstName'],
                'last_name' => $data['lastName'],
                'username' => $data['username'],
                'password' => $password,
                'must_change_password' => true,
                'section_id' => $data['sectionId'] ?? null,
                'committee_function_id' => $data['committeeFunctionId'] ?? null,
                'instructor_of_section_id' => $data['instructorOfSectionId'] ?? null,
                'public_visible' => $data['publicVisible'],
            ]);

            $member->roles()->attach(Role::baseline()->id);

            return $member;
        });

        Audit::record($request->user(), 'member.created', 'member', $member->id, $member->fullName());

        // A literal wrapping a Resource: the credential must never appear in
        // MemberResource, where every later roster read would carry it.
        $body = [
            'member' => new MemberResource($member->load(['section', 'roles'])),
            'generatedPassword' => $password,
        ];

        return response()->json($body, 201);
    }

    /**
     * Correct a member's details.
     *
     * Requires `members.manage`. Send only the fields that change: an omitted
     * field is left alone, and an explicit `null` clears an optional one such
     * as the register or the committee seat. Returns the updated member.
     *
     * Roles and passwords are not editable here. They are
     * `PUT /api/v1/members/{member}/roles` and
     * `POST /api/v1/members/{member}/password`, each of which also ends the
     * member's sessions.
     *
     * A username already in use answers `400 validation_failed` with
     * `already_taken` against `username`, and one that is not lower-case
     * letters, digits, dot, hyphen or underscore answers `invalid_format`.
     */
    public function update(UpdateMemberRequest $request, Member $member): MemberResource
    {
        // array_key_exists() on validated(), not isset(): isset() is false for
        // an explicit null, so clearing a register would silently do nothing.
        $data = $request->validated();

        $columns = [
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'username' => 'username',
            'sectionId' => 'section_id',
            'committeeFunctionId' => 'committee_function_id',
            'instructorOfSectionId' => 'instructor_of_section_id',
            'publicVisible' => 'public_visible',
        ];

        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $data)) {
                $member->{$column} = $data[$field];
            }
        }

        $member->save();

        Audit::record($request->user(), 'member.updated', 'member', $member->id, $member->fullName());

        return new MemberResource($member->load(['section', 'roles']));
    }

    /**
     * Remove a member from the roster.
     *
     * Requires `members.manage`. Deletes the person outright and ends every
     * session they have open, so a deleted member stops being logged in at
     * once. There is no deactivation flag and no undo: leaving the band is
     * this call. Answers `{"ok": true, "sessionsEnded": n}`.
     *
     * Refuses with `409 cannot_remove_last_administrator` or
     * `409 cannot_remove_last_role_administrator` when the target is the only
     * member left who could administer members or roles, and
     * `409 cannot_delete_self` when the target is the caller. Both are `409`
     * rather than `403` because the caller does hold the permission; the
     * request conflicts with the state of the roster. When both apply, the
     * last-administrator refusal is the one returned.
     */
    #[Response(200, 'Removed. `sessionsEnded` counts the sessions revoked in the same transaction.')]
    #[Emits('cannot_remove_last_administrator', 'cannot_remove_last_role_administrator', 'cannot_delete_self')]
    public function destroy(Request $request, Member $member): JsonResponse
    {
        // Existence is the state (ADR 0015): there is no `active` flag and no
        // soft delete.
        //
        // No re-authentication (ADR 0017): the session is trusted, as for
        // reading the roster and editing anyone. The UI's type-the-name
        // confirmation guards against a mis-aimed tap; a server cannot tell a
        // typed confirmation from an automated one.
        AccessIntegrity::assertMayDelete($request->user(), $member);

        // Captured before the delete, because the row is gone by the time
        // anyone reads the audit back.
        $label = $member->fullName();
        $id = $member->id;

        $sessionsEnded = DB::transaction(function () use ($member): int {
            // `sessions` has no foreign key to members, so nothing cascades
            // into it: without this, a deleted member stays logged in until
            // the cookie expires.
            //
            // Before the delete, so a failed delete logs nobody out of an
            // account that still exists. No test pins this order; moving it
            // keeps the suite green.
            $ended = SessionRevoker::forMember($member->id);

            $member->delete();

            return $ended;
        });

        Audit::record($request->user(), 'member.deleted', 'member', $id, $label);

        return response()->json(['ok' => true, 'sessionsEnded' => $sessionsEnded]);
    }
}

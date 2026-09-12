<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMemberRequest;
use App\Http\Requests\UpdateMemberRequest;
use App\Http\Resources\MemberResource;
use App\Models\Member;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\Emits;
use App\Support\GeneratedPassword;
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
     * (`sectionId` and `sectionName`), whether they play (`isPlayer`), their
     * committee title, whether they may be shown on the public site, and
     * `roleIds`, the roles they hold.
     *
     * No password and no hash is ever included, and neither are effective
     * permissions: a role is what grants them, so read `GET /api/v1/roles` and
     * join on `roleIds`.
     */
    public function index(): AnonymousResourceCollection
    {
        // Ordered by name because this screen is scanned for a person, not
        // browsed by register. Grouping by register is the UI's business, and
        // it has sectionName to do it with.
        //
        // with() is not an optimisation to revisit later: ~45 members without
        // it is three queries each on a shared host, and the screen that
        // administers the band is the one that would feel it. Pinned by
        // MemberIndexTest::test_listing_the_roster_costs_a_fixed_number_of_queries.
        //
        // The assignment below is load-bearing, and a blank line is NOT
        // enough. Scramble publishes the comment block preceding a return as
        // that operation's 200 response description, and it walks back past
        // blank lines to find it. Measured 2026-09-10: this paragraph, test
        // name included, was being served at /api/docs. An intervening
        // statement is what breaks the association.
        $roster = Member::with(['section', 'roles'])
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
     * the `If-Match` header of the write. The list hands out no tag — one tag
     * cannot validate forty-five rows — so a form filled from the list and
     * submitted without a read is the lost update this API refuses.
     */
    public function show(Member $member): MemberResource
    {
        // Loaded explicitly for the same reason index() eager-loads: the
        // Resource publishes sectionName and roleIds, and an unloaded relation
        // would cost two extra queries here.
        //
        // THE ASSIGNMENT BELOW IS LOAD-BEARING, exactly as it is in index():
        // Scramble publishes the comment block preceding a return as that
        // operation's 200 response description, walking back past blank lines
        // to find it. This paragraph shipped to /api/docs once already, and
        // DocsTest caught it because it named a class.
        $person = $member->load(['section', 'roles']);

        return new MemberResource($person);
    }

    /**
     * Add a member to the roster.
     *
     * Requires `members.manage`. Creating a person creates their account:
     * every member has one. Send `firstName`, `lastName`, `username` and
     * `publicVisible`, and optionally `sectionId`, `committeeTitle` and
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
     * No roles are granted. Roles are `PUT /api/v1/members/{member}/roles`, and
     * no password may be chosen here.
     *
     * A missing required field answers `400 validation_failed` naming the
     * field with `required`. A username already in use answers the same with
     * `already_taken`; one containing anything but lower-case letters, digits,
     * dot, hyphen or underscore answers `invalid_format`.
     */
    #[Response(201, 'The new member, plus the generated password. It is shown once and never retrievable again.')]
    public function store(StoreMemberRequest $request): JsonResponse
    {
        // THE PASSWORD IS MINTED HERE AND RETURNED ONCE. The plan had create
        // make a person with no credential, leaving "give this person an
        // account" as a separate operation. That cannot survive the credentials
        // model: a member created with an unusable placeholder could be granted
        // members.manage and then be the only administrator left after a
        // deletion — holding the permission and unable to log in. That is the
        // ghost administrator 2026_09_08_000001 dissolved, and this is the door
        // it would have come back through.
        //
        // The value is the same readable, dictatable one a reset produces
        // (GeneratedPassword), and must_change_password is set, because a
        // password an administrator read down the phone is not a secret worth
        // keeping.
        //
        // IT GRANTS NO ROLES, and that is a security property rather than a
        // simplification. Granting a permission is exactly one operation —
        // PUT /members/{member}/roles — which checks the lockout invariants,
        // ends the target's sessions and audits. Accepting roleIds here would
        // have made the UNGUARDED path strictly easier than the guarded one: a
        // stolen session could mint a member holding `direction` and read its
        // password straight out of this response, a persistent backdoor.
        //
        // No AccessIntegrity check is needed for the same reason: a person with
        // no roles cannot orphan administration or demote anybody.
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
                'committee_title' => $data['committeeTitle'] ?? null,
                'instructor_of_section_id' => $data['instructorOfSectionId'] ?? null,
                'public_visible' => $data['publicVisible'],
            ]);

            return $member;
        });

        Audit::record($request->user(), 'member.created', 'member', $member->id, $member->fullName());

        // A literal wrapping a Resource, deliberately: the credential is not
        // part of a member and must never appear in MemberResource, where every
        // later read of the roster would carry it.
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
     * as the register or the committee title. Returns the updated member.
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
        // Not destructive, so it deliberately does not prompt for a password.
        //
        // The fields go through array_key_exists(), not isset() or has(): both
        // are false for an explicitly-sent null, so clearing a register would
        // silently do nothing.
        $data = $request->validated();

        $columns = [
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'username' => 'username',
            'sectionId' => 'section_id',
            'committeeTitle' => 'committee_title',
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
     * Refuses with `409 cannot_remove_last_administrator` when the target is
     * the only member left who could administer members, and
     * `409 cannot_delete_self` when the target is the caller. Both are `409`
     * rather than `403` because the caller does hold the permission; the
     * request conflicts with the state of the roster. When both apply, the
     * last-administrator refusal is the one returned.
     */
    #[Response(200, 'Removed. `sessionsEnded` counts the sessions revoked in the same transaction.')]
    #[Emits('cannot_remove_last_administrator', 'cannot_delete_self')]
    public function destroy(Request $request, Member $member): JsonResponse
    {
        // Existence is the state (design D3): there is no `active` flag and no
        // soft delete.
        //
        // NO RE-AUTHENTICATION (decision B7, 2026-09-08). The session cookie is
        // trusted, as it already is for reading the whole roster and editing
        // anyone. Protection against a mis-aimed tap is the type-the-name
        // confirmation in the UI, which is where mistake-prevention belongs — a
        // server cannot tell a typed confirmation from an automated one.
        AccessIntegrity::assertMayDelete($request->user(), $member);

        // Captured BEFORE the delete, because the row is gone by the time
        // anyone reads the audit back.
        $label = $member->fullName();
        $id = $member->id;

        $sessionsEnded = DB::transaction(function () use ($member): int {
            // `sessions` has NO foreign key to members, so nothing cascades
            // into it — a deleted member stays logged in until their cookie
            // expires unless this runs. Without it, hard-delete is theatre.
            //
            // BEFORE the delete, and MEASURED 2026-09-08: moving it after keeps
            // every test green, because the delete cascades nothing into
            // sessions either way. The ordering is about transaction safety
            // rather than the row count — if the delete fails, nobody has been
            // logged out of an account that still exists. Kept first
            // deliberately, and recorded here because no test distinguishes it.
            $ended = SessionRevoker::forMember($member->id);

            $member->delete();

            return $ended;
        });

        Audit::record($request->user(), 'member.deleted', 'member', $id, $label);

        return response()->json(['ok' => true, 'sessionsEnded' => $sessionsEnded]);
    }
}

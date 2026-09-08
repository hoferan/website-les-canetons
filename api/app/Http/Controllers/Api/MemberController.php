<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMemberRequest;
use App\Http\Requests\UpdateMemberRequest;
use App\Http\Resources\MemberResource;
use App\Models\Member;
use App\Support\AccessIntegrity;
use App\Support\Audit;
use App\Support\GeneratedPassword;
use App\Support\Reauthentication;
use App\Support\SessionRevoker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class MemberController extends Controller
{
    /**
     * The whole roster — everyone, account or not.
     *
     * Ordered by name because this screen is scanned for a person, not browsed
     * by register. Grouping by register is the UI's business, and it has
     * sectionName to do it with.
     *
     * with() is not an optimisation to revisit later: ~45 members without it is
     * three queries each on a shared host, and the screen that administers the
     * band is the one that would feel it. Pinned by
     * MemberIndexTest::test_listing_the_roster_costs_a_fixed_number_of_queries.
     */
    public function index(): AnonymousResourceCollection
    {
        return MemberResource::collection(
            Member::with(['section', 'roles'])
                ->orderBy('last_name')
                ->orderBy('first_name')
                ->get()
        );
    }

    /**
     * Creates a person — which means creating an account, because every member
     * has one (2026_09_08_000001).
     *
     * THE PASSWORD IS MINTED HERE AND RETURNED ONCE. The plan had create make a
     * person with no credential, leaving "give this person an account" as a
     * separate operation. That cannot survive the credentials model: a member
     * created with an unusable placeholder could be granted members.manage and
     * then be the only administrator left after a deletion — holding the
     * permission and unable to log in. That is the ghost administrator the
     * migration dissolved, and this is the door it would have come back
     * through.
     *
     * The value is the same readable, dictatable one a reset produces
     * (GeneratedPassword), and must_change_password is set, because a password
     * an administrator read down the phone is not a secret worth keeping.
     *
     * IT GRANTS NO ROLES, and that is a security property rather than a
     * simplification. Granting a permission is exactly one operation —
     * PUT /members/{member}/roles — which re-authenticates, checks the lockout
     * invariants and audits. Accepting roleIds here would have made the
     * UNGUARDED path strictly easier than the guarded one: a stolen session
     * could mint a member holding `direction` and read its password straight
     * out of this response, a persistent backdoor needing no password at all.
     *
     * No AccessIntegrity check is needed for the same reason: a person with no
     * roles cannot orphan administration or demote anybody.
     */
    public function store(StoreMemberRequest $request): JsonResponse
    {
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
        return response()->json([
            'member' => new MemberResource($member->load(['section', 'roles'])),
            'generatedPassword' => $password,
        ], 201);
    }

    /**
     * Edits a person. Roles and passwords are elsewhere, each behind its own
     * re-authentication — this is not destructive and deliberately does not
     * prompt for one.
     *
     * The fields go through array_key_exists(), not isset() or has(): both are
     * false for an explicitly-sent null, so clearing a register would silently
     * do nothing.
     */
    public function update(UpdateMemberRequest $request, Member $member): MemberResource
    {
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
     * Removes a person entirely.
     *
     * Existence is the state (design D3): there is no `active` flag and no soft
     * delete, so leaving the band is this.
     *
     * Same ordering rule as MemberRoleController — re-authenticate, then check
     * the invariants, then write — and capture the name BEFORE the delete,
     * because the row is gone by the time anyone reads the audit back.
     *
     * REQUIRES THE `X-Reauth-Password` HEADER carrying the caller's own current
     * password. Not a body field and never a query parameter: Apache logs query
     * strings in plain text, and RFC 9110 gives a DELETE body no defined
     * semantics, which is how the generated client once turned this into
     * ?currentPassword=... See App\Support\Reauthentication.
     */
    public function destroy(Request $request, Member $member): JsonResponse
    {
        Reauthentication::assertFromRequest($request, $request->user());

        AccessIntegrity::assertMayDelete($request->user(), $member);

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

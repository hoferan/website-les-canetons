<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /api/responses?eventId=N — the admin's attendance summary for one event.
 *
 * The exact opposite access rule to the POST on the same path: responding is
 * `respond` (user/moderator), reading everyone's answers is `view_summary`
 * (admin). The matrix is not a hierarchy, so each is refused by the other's
 * holders — see ResponseStoreTest for the write side.
 *
 * Three properties are pinned here beyond the happy path:
 *   1. ONLY roles that may respond are listed. That set is derived from
 *      App\Support\Capability::rolesWith('respond'), never hardcoded, so the
 *      admin is absent — otherwise inscriptions_admin.js would count the Team
 *      Direction as "Pas de réponse" on every single event;
 *   2. a member who has not answered is still LISTED, with response: null. The
 *      summary's "Convoqués" total and its pending count are computed from the
 *      length of this list, so a missing row would silently shrink the roll
 *      call rather than show up as a pending answer;
 *   3. the ordering is the legacy query's COALESCE(answer, '') DESC, username —
 *      which, on the two enum values, means participate, then notparticipate,
 *      then the unanswered, each alphabetical by username.
 */
class ResponseSummaryTest extends TestCase
{
    use RefreshDatabase;

    private function event(string $date = '2027-01-09'): Event
    {
        return Event::create([
            'date' => $date,
            'title' => 'Repetition',
            'start_time' => '20:00:00',
            'end_time' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 0,
        ]);
    }

    private function user(string $username, string $role = 'user', ?int $instrumentId = null): User
    {
        return User::create([
            'username' => $username,
            'password' => 'x',
            'role' => $role,
            'instrument_id' => $instrumentId,
        ]);
    }

    /** No Instrument model exists — the summary only ever reads the joined name. */
    private function instrument(string $name): int
    {
        return (int) DB::table('instruments')->insertGetId(['name' => $name]);
    }

    private function answer(User $user, Event $event, string $answer): void
    {
        Response::create(['user_id' => $user->id, 'event_id' => $event->id, 'answer' => $answer]);
    }

    private function admin(): User
    {
        return $this->user('zz.admin', 'admin');
    }

    public function test_it_lists_responding_roles_with_their_answers_and_excludes_the_admin(): void
    {
        $event = $this->event();
        $alice = $this->user('demo.alice');
        $mod = $this->user('demo.moderator', 'moderator');
        $admin = $this->admin();
        $this->answer($alice, $event, 'participate');
        $this->answer($mod, $event, 'notparticipate');

        $response = $this->actingAs($admin)->getJson("/api/responses?eventId={$event->id}");

        // assertExactJson: the admin's ABSENCE is the assertion, so an extra row
        // must fail just as loudly as a wrong one.
        $response->assertOk()->assertExactJson([
            ['username' => 'demo.alice', 'instrument' => null, 'response' => 'participate'],
            ['username' => 'demo.moderator', 'instrument' => null, 'response' => 'notparticipate'],
        ]);
    }

    /**
     * Belt and braces on the exclusion: even if the admin has somehow answered
     * (a stale row from before the capability split, or a direct DB edit), the
     * summary is filtered by ROLE, so the row must not surface.
     */
    public function test_an_admins_stored_answer_is_still_not_listed(): void
    {
        $event = $this->event();
        $admin = $this->admin();
        $this->answer($admin, $event, 'participate');

        $this->actingAs($admin)->getJson("/api/responses?eventId={$event->id}")
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_a_member_with_no_answer_is_listed_with_null(): void
    {
        $event = $this->event();
        $this->user('demo.silent');

        $this->actingAs($this->admin())->getJson("/api/responses?eventId={$event->id}")
            ->assertOk()
            ->assertExactJson([
                ['username' => 'demo.silent', 'instrument' => null, 'response' => null],
            ]);
    }

    public function test_the_instrument_name_is_included(): void
    {
        $event = $this->event();
        // inscriptions_admin.js matches these names literally when it counts
        // participants per instrument, so it is the NAME that must arrive, not
        // the id.
        $this->user('demo.trumpet', 'user', $this->instrument('Trompette'));
        $this->user('demo.nobody');

        $this->actingAs($this->admin())->getJson("/api/responses?eventId={$event->id}")
            ->assertOk()
            ->assertExactJson([
                ['username' => 'demo.nobody', 'instrument' => null, 'response' => null],
                ['username' => 'demo.trumpet', 'instrument' => 'Trompette', 'response' => null],
            ]);
    }

    /**
     * Only the REQUESTED event's answers are joined. A member who answered a
     * different event must appear as unanswered here, not carry that answer
     * across — the old query put the event id in the LEFT JOIN's ON clause
     * precisely so an unanswered member is still listed.
     */
    public function test_another_events_answer_does_not_leak_in(): void
    {
        $event = $this->event('2027-01-09');
        $other = $this->event('2027-02-14');
        $user = $this->user('demo.user');
        $this->answer($user, $other, 'participate');

        $this->actingAs($this->admin())->getJson("/api/responses?eventId={$event->id}")
            ->assertOk()
            ->assertExactJson([
                ['username' => 'demo.user', 'instrument' => null, 'response' => null],
            ]);
    }

    /**
     * The legacy ORDER BY, reproduced: COALESCE(answer, '') DESC puts
     * 'participate' before 'notparticipate' before '' (the unanswered), and
     * username breaks every tie. Two members share each answer so the tiebreak
     * is actually exercised, and they are inserted in the reverse of the
     * expected order so insertion/id order cannot pass by accident.
     */
    public function test_the_ordering_is_answer_desc_then_username(): void
    {
        $event = $this->event();
        $eve = $this->user('e.eve');
        $dan = $this->user('d.dan');
        $cara = $this->user('c.cara');
        $bob = $this->user('b.bob');
        $zoe = $this->user('a.zoe');
        $amy = $this->user('a.amy');
        $this->answer($cara, $event, 'notparticipate');
        $this->answer($bob, $event, 'notparticipate');
        $this->answer($zoe, $event, 'participate');
        $this->answer($amy, $event, 'participate');
        // $dan and $eve deliberately never answer.

        $rows = $this->actingAs($this->admin())
            ->getJson("/api/responses?eventId={$event->id}")
            ->assertOk()
            ->json();

        $this->assertSame(
            ['a.amy', 'a.zoe', 'b.bob', 'c.cara', 'd.dan', 'e.eve'],
            array_column($rows, 'username')
        );
        $this->assertSame(
            ['participate', 'participate', 'notparticipate', 'notparticipate', null, null],
            array_column($rows, 'response')
        );
    }

    public function test_a_user_role_may_not_see_the_summary(): void
    {
        $event = $this->event();
        $user = $this->user('demo.user');

        $this->actingAs($user)->getJson("/api/responses?eventId={$event->id}")
            ->assertStatus(403)
            ->assertExactJson(['error' => 'Access denied', 'code' => 'access_denied']);
    }

    public function test_a_moderator_may_not_see_the_summary_either(): void
    {
        $event = $this->event();
        $moderator = $this->user('demo.moderator', 'moderator');

        $this->actingAs($moderator)->getJson("/api/responses?eventId={$event->id}")
            ->assertStatus(403);
    }

    public function test_an_anonymous_caller_is_unauthenticated(): void
    {
        $this->getJson('/api/responses?eventId=1')
            ->assertStatus(401)
            ->assertExactJson(['error' => 'Not authenticated', 'code' => 'not_authenticated']);
    }

    public function test_a_missing_event_id_is_required(): void
    {
        $this->actingAs($this->admin())->getJson('/api/responses')
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [['field' => 'eventId', 'reason' => 'required']],
            ]);
    }

    /** An empty ?eventId= is absent, not merely unusable — the old branch order. */
    public function test_an_empty_event_id_is_required(): void
    {
        $this->actingAs($this->admin())->getJson('/api/responses?eventId=')
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'eventId')
            ->assertJsonPath('fields.0.reason', 'required');
    }

    /**
     * 'invalid_number', deliberately NOT the legacy endpoint's 'invalid_value'.
     * assertExactJson pins the ABSENCE of a `params` key as hard as the token:
     * this hand-rolled path has nowhere to carry params, and invalid_value's
     * French interpolates {{allowed}} — which i18next would print literally.
     * invalid_value is reserved for Laravel's `in` rule, the only thing that
     * supplies that list. invalid_number is also simply the accurate token: 0 is
     * a bad number, not an enum mismatch. See ResponseController::index().
     */
    public function test_a_zero_event_id_is_not_a_valid_number(): void
    {
        $this->actingAs($this->admin())->getJson('/api/responses?eventId=0')
            ->assertStatus(400)
            ->assertExactJson([
                'error' => 'Invalid form submission',
                'code' => 'validation_failed',
                'fields' => [['field' => 'eventId', 'reason' => 'invalid_number']],
            ]);
    }

    public function test_a_non_numeric_event_id_is_not_a_valid_number(): void
    {
        // (int) 'abc' is 0, which the <= 0 branch refuses — the legacy cast.
        $this->actingAs($this->admin())->getJson('/api/responses?eventId=abc')
            ->assertStatus(400)
            ->assertJsonPath('fields.0.reason', 'invalid_number');
    }

    /**
     * CONSISTENCY: the same bad eventId reports the same reason whether it
     * arrives on the write or the read. The GET's check is hand-rolled while the
     * POST's comes from ResponseRequest's gt:0 rule, so nothing but a test keeps
     * the two tokens aligned — and it is the drift, not either value alone, that
     * would confuse a translating consumer looking at one field.
     *
     * Asserted by comparing the two live responses rather than against a
     * literal, so re-tokenising one side without the other fails here.
     */
    public function test_a_non_positive_event_id_reports_the_same_token_as_the_post(): void
    {
        $onRead = $this->actingAs($this->admin())
            ->getJson('/api/responses?eventId=0')
            ->assertStatus(400)
            ->json('fields.0');

        $onWrite = $this->actingAs($this->user('demo.writer'))
            ->postJson('/api/responses', ['eventId' => 0, 'participation' => 'participate'])
            ->assertStatus(400)
            ->json('fields.0');

        $this->assertSame($onWrite, $onRead);
        $this->assertSame(['field' => 'eventId', 'reason' => 'invalid_number'], $onRead);
    }

    /**
     * An event nobody could have answered still returns a well-formed LIST, not
     * an object and not null: inscriptions_admin.js calls .filter() on the
     * parsed body before it checks anything.
     */
    public function test_an_event_with_no_eligible_members_returns_an_empty_json_array(): void
    {
        $event = $this->event();

        $this->actingAs($this->admin())->getJson("/api/responses?eventId={$event->id}")
            ->assertOk()
            ->assertExactJson([]);
    }

    /**
     * An id for an event that does not exist is a 200 with everyone unanswered,
     * NOT a 404 — the old GET never checked the event's existence (only the POST
     * did), and its LEFT JOIN simply matched nothing.
     */
    public function test_an_unknown_event_lists_everyone_as_unanswered(): void
    {
        $this->user('demo.user');

        $this->actingAs($this->admin())->getJson('/api/responses?eventId=999999')
            ->assertOk()
            ->assertExactJson([
                ['username' => 'demo.user', 'instrument' => null, 'response' => null],
            ]);
    }
}

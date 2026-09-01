<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Response;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /api/events — the PUBLIC events index.
 *
 * Three properties are pinned here beyond the happy path:
 *   1. it is genuinely public — planning_repet.js and sinscrire.js both fetch it
 *      before the visitor has logged in, so an anonymous caller gets 200 with
 *      `response: null` everywhere, never a 401;
 *   2. a logged-in caller sees THEIR OWN answer, and only their own — the
 *      no-other-user's-answer test below is the IDOR guard and the single most
 *      important assertion in this file. The endpoint takes no parameter that
 *      names a user (no ?username=, no ?userId=), which is what keeps a
 *      previously-fixed IDOR closed; if one is ever added, that test must fail;
 *   3. the payload is the camelCase frontend shape (startTime/endTime, integer
 *      weekend) that planning_repet.js already reads. Do not "fix" it to the
 *      snake_case column names.
 */
class EventIndexTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A date N days from today, as 'YYYY-MM-DD'.
     *
     * Dates here are OFFSETS, not literals, because GET /api/events filters to
     * upcoming events by default. Every date in this file used to be a 2027
     * literal, which was harmless while the endpoint returned everything and a
     * dated time bomb the moment it did not: each one would have fallen out of
     * the default response on its own date, failing tests that are not about
     * dates at all.
     *
     * now() is UTC (api/config/app.php hardcodes it) and so is the controller's
     * comparison, so the two agree by construction.
     */
    private function inDays(int $days): string
    {
        return now()->addDays($days)->toDateString();
    }

    private function event(string $date, array $overrides = []): Event
    {
        return Event::create($overrides + [
            'date' => $date,
            'title' => 'Repetition',
            'start_time' => '20:00:00',
            'end_time' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 0,
        ]);
    }

    private function user(string $username, string $role = 'user'): User
    {
        return User::create(['username' => $username, 'password' => 'x', 'role' => $role]);
    }

    public function test_events_are_public_and_ordered_by_date(): void
    {
        // Inserted out of order, so the response pins the old query's ORDER BY
        // date rather than insertion / id order.
        $this->event($this->inDays(90), ['title' => 'Third']);
        $this->event($this->inDays(30), ['title' => 'First']);
        $this->event($this->inDays(60), ['title' => 'Second']);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('0.title', 'First')
            ->assertJsonPath('1.title', 'Second')
            ->assertJsonPath('2.title', 'Third');
    }

    public function test_past_events_are_excluded_by_default(): void
    {
        $this->event($this->inDays(-7), ['title' => 'Past']);
        $this->event($this->inDays(7), ['title' => 'Upcoming']);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Upcoming');
    }

    /**
     * An event happening TODAY is still upcoming — it has not happened yet.
     * The column is a plain `date` with no time component, so there is nothing
     * finer to compare against and the boundary must be inclusive.
     */
    public function test_an_event_today_is_still_upcoming(): void
    {
        $this->event($this->inDays(0), ['title' => 'Today']);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Today');
    }

    public function test_include_past_returns_the_whole_history(): void
    {
        $this->event($this->inDays(-7), ['title' => 'Past']);
        $this->event($this->inDays(7), ['title' => 'Upcoming']);

        $this->getJson('/api/events?include=past')
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.title', 'Past')
            ->assertJsonPath('1.title', 'Upcoming');
    }

    /**
     * Anything that is not exactly `past` gets the safe answer, mirroring the
     * convention POST /api/migrate already uses for `?mode`: only the exact
     * string opts in, so a typo cannot silently widen what is returned.
     */
    public function test_an_unrecognised_include_value_falls_back_to_the_default(): void
    {
        $this->event($this->inDays(-7), ['title' => 'Past']);

        $this->getJson('/api/events?include=everything')
            ->assertOk()
            ->assertJsonCount(0);
    }

    public function test_an_anonymous_caller_sees_no_responses(): void
    {
        $event = $this->event($this->inDays(30));
        // A response exists in the database — it must simply never be reachable
        // without an authenticated session.
        Response::create([
            'user_id' => $this->user('demo.user')->id,
            'event_id' => $event->id,
            'answer' => 'participate',
        ]);

        $this->getJson('/api/events')
            ->assertOk()
            ->assertJsonPath('0.response', null);
    }

    public function test_a_logged_in_user_sees_their_own_answer(): void
    {
        $event = $this->event($this->inDays(30));
        $user = $this->user('demo.user');
        Response::create([
            'user_id' => $user->id,
            'event_id' => $event->id,
            'answer' => 'notparticipate',
        ]);

        $this->actingAs($user)->getJson('/api/events')
            ->assertOk()
            ->assertJsonPath('0.response', 'notparticipate');
    }

    /**
     * THE IDOR GUARD. Another member's answer is in the same table, on the same
     * event; the caller must still see null. There is no request parameter that
     * could select whose answers to read, and the query itself is constrained to
     * the caller's own user_id so nothing else can leak in by accident.
     */
    public function test_a_user_never_sees_another_users_answer(): void
    {
        $event = $this->event($this->inDays(30));
        $other = $this->user('demo.other');
        $caller = $this->user('demo.caller');
        Response::create([
            'user_id' => $other->id,
            'event_id' => $event->id,
            'answer' => 'participate',
        ]);

        $response = $this->actingAs($caller)->getJson('/api/events');

        $response->assertOk()->assertJsonPath('0.response', null);
        // Belt and braces: the other member's answer must not appear anywhere in
        // the payload, under any key — not merely be absent from `response`.
        $this->assertStringNotContainsString('participate', $response->getContent());

        // Compared VALUE BY VALUE, not as a substring of the serialized
        // payload. A user id is a small integer, and the payload is full of
        // digits, so a substring search matches by luck: this asserted nothing
        // at id 8 and failed spuriously at id 9, whose digit is in the date
        // "2027-01-09". Which id a test gets depends on how many rows earlier
        // tests inserted — RefreshDatabase's transaction rolls the rows back
        // but AUTO_INCREMENT does not rewind — so adding a user anywhere in
        // the suite could flip this either way.
        foreach ($response->json() as $event) {
            $values = array_map(
                static fn ($v) => is_scalar($v) ? (string) $v : json_encode($v),
                array_diff_key($event, ['id' => null])
            );

            $this->assertNotContains(
                (string) $other->id,
                $values,
                "The other member's user id leaked into the events payload."
            );
        }
    }

    public function test_two_users_each_see_only_their_own_answer(): void
    {
        $event = $this->event($this->inDays(30));
        $alice = $this->user('demo.alice');
        $bob = $this->user('demo.bob');
        Response::create(['user_id' => $alice->id, 'event_id' => $event->id, 'answer' => 'participate']);
        Response::create(['user_id' => $bob->id, 'event_id' => $event->id, 'answer' => 'notparticipate']);

        $this->actingAs($alice)->getJson('/api/events')
            ->assertJsonPath('0.response', 'participate');

        $this->actingAs($bob)->getJson('/api/events')
            ->assertJsonPath('0.response', 'notparticipate');
    }

    public function test_the_payload_uses_the_camel_case_frontend_shape(): void
    {
        $date = $this->inDays(180);
        $event = $this->event($date, ['title' => 'Carnaval', 'weekend' => 1]);

        $response = $this->getJson('/api/events')->assertOk();

        // assertExactJson on the whole body: an EXTRA key would be a leak just
        // as much as a renamed one would be a break.
        $response->assertExactJson([[
            'id' => $event->id,
            'date' => $date,
            'title' => 'Carnaval',
            'startTime' => '20:00:00',
            'endTime' => '22:00:00',
            'location' => 'Local',
            'attire' => 'Casual',
            'weekend' => 1,
            'response' => null,
        ]]);
    }

    /**
     * No N+1: the own-response annotation is a single constrained eager-load,
     * not a lookup per event. Asserted as "the query count does not grow with
     * the number of events" rather than against a hardcoded number, so the test
     * stays about the N+1 property and does not break on an unrelated extra
     * query somewhere in the stack.
     */
    public function test_the_index_does_not_issue_a_query_per_event(): void
    {
        $user = $this->user('demo.user');
        $this->event($this->inDays(30));
        $withOne = $this->countQueries(fn () => $this->actingAs($user)->getJson('/api/events')->assertOk());

        foreach ([$this->inDays(60), $this->inDays(90), $this->inDays(120), $this->inDays(150)] as $date) {
            $this->event($date);
        }
        $withFive = $this->countQueries(fn () => $this->actingAs($user)->getJson('/api/events')->assertOk());

        $this->assertSame(
            $withOne,
            $withFive,
            "the index ran $withOne queries for 1 event but $withFive for 5 — that is an N+1"
        );
    }

    private function countQueries(callable $work): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        try {
            $work();

            return count(DB::getQueryLog());
        } finally {
            DB::disableQueryLog();
        }
    }

    public function test_an_empty_events_table_returns_an_empty_json_array(): void
    {
        // Not an object and not null: planning_repet.js calls .sort()/.forEach()
        // on the parsed body straight away.
        $this->getJson('/api/events')->assertOk()->assertExactJson([]);
    }
}

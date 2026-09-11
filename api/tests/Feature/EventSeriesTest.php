<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class EventSeriesTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'template' => [
                'title' => 'Répétition',
                'location' => 'Werkhof',
                'attire' => 'Libre',
                'isPublic' => false,
                'notes' => null,
                'startTime' => '10:00',
                'endTime' => '12:00',
            ],
            'dates' => ['2026-09-05', '2026-09-12', '2026-09-19'],
        ], $overrides);
    }

    public function test_it_creates_one_event_per_date(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload())
            ->assertStatus(201)
            ->assertJsonCount(3);

        $this->assertSame(3, Event::query()->count());
    }

    public function test_every_created_event_is_independent(): void
    {
        // C3: nothing links them. This is what makes "how does a player attend
        // one occurrence?" a non-question — each one is an ordinary event.
        $this->actingAsMember($this->organiser)->postJson('/api/v1/events/series', $this->payload());

        $titles = Event::query()->pluck('title')->all();
        $this->assertSame(['Répétition', 'Répétition', 'Répétition'], $titles);

        // No column ties them together.
        $this->assertFalse(Schema::hasColumn('events', 'series_id'));
    }

    public function test_the_wall_clock_time_is_the_same_in_summer_and_winter(): void
    {
        // The trap this whole endpoint could fall into: September is CEST and
        // December is CET, so a naive fixed offset makes half a season an hour
        // wrong. Both must read back as 10:00 in Fribourg.
        $this->actingAsMember($this->organiser)->postJson('/api/v1/events/series', $this->payload([
            'dates' => ['2026-09-05', '2026-12-05'],
        ]));

        $times = Event::query()->orderBy('starts_at')->get()
            ->map(fn (Event $e) => $e->starts_at->setTimezone('Europe/Zurich')->format('H:i'))
            ->all();

        $this->assertSame(['10:00', '10:00'], $times);

        // And the STORED instants differ by exactly the offset change, which
        // is the half of it a wall-clock assertion alone cannot see: an
        // endpoint that stored the literal 10:00 in both rows would satisfy
        // the check above only if it also read them back wrong in the same
        // way. 08:00 UTC in CEST, 09:00 UTC in CET.
        $stored = Event::query()->orderBy('starts_at')->get()
            ->map(fn (Event $e) => $e->starts_at->utc()->format('H:i'))
            ->all();

        $this->assertSame(['08:00', '09:00'], $stored);
    }

    public function test_a_player_cannot_generate_a_season(): void
    {
        $player = Member::factory()->inSection('Cloches')->create();

        $this->actingAsMember($player)
            ->postJson('/api/v1/events/series', $this->payload())
            ->assertStatus(403);

        $this->assertSame(0, Event::query()->count());
    }

    public function test_events_manage_alone_is_enough_to_generate_a_season(): void
    {
        // PINS THE PERMISSION STRING, for the reason EventWriteTest's twin of
        // this test documents: the organiser holds `direction`, which the seed
        // grants every permission, so a player with none cannot tell
        // events.manage from any other string in that middleware.
        $organiserOnly = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();

        $this->actingAsMember($organiserOnly)
            ->postJson('/api/v1/events/series', $this->payload())
            ->assertStatus(201);

        $this->assertSame(3, Event::query()->count());
    }

    public function test_it_refuses_more_dates_than_two_seasons_of_rehearsals(): void
    {
        // 60 is well past any honest use. Without a cap a malformed request
        // asks a shared host to write ten thousand rows.
        $dates = [];
        for ($i = 0; $i < 61; $i++) {
            $dates[] = now()->addWeeks($i)->format('Y-m-d');
        }

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload(['dates' => $dates]))
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'dates')
            ->assertJsonPath('fields.0.reason', 'too_long')
            ->assertJsonPath('fields.0.params.max', 60);

        $this->assertSame(0, Event::query()->count());
    }

    public function test_sixty_dates_is_still_accepted(): void
    {
        // The boundary from the other side. `max:60` and a controller-side
        // `>= 60` differ by exactly one row, and only a test at the edge can
        // tell them apart — 61 being refused says nothing about whether 60
        // works.
        $dates = [];
        for ($i = 0; $i < 60; $i++) {
            $dates[] = now()->addWeeks($i)->format('Y-m-d');
        }

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload(['dates' => $dates]))
            ->assertStatus(201);

        $this->assertSame(60, Event::query()->count());
    }

    public function test_an_empty_date_list_is_refused(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload(['dates' => []]))
            ->assertStatus(400)
            // `required`, not `too_short`: Laravel's required already refuses
            // an empty array, and StoreEventSeriesRequest deliberately omits
            // `min:1` so the committee is told the list is missing rather than
            // that it "est trop court (minimum 1 caractères)".
            ->assertJsonPath('fields.0.field', 'dates')
            ->assertJsonPath('fields.0.reason', 'required');
    }

    public function test_one_bad_date_writes_nothing_at_all(): void
    {
        // One transaction. A half-created season is worse than none, because
        // the committee has no way to tell which half landed.
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload([
                'dates' => ['2026-09-05', 'pas-une-date'],
            ]))
            ->assertStatus(400);

        $this->assertSame(0, Event::query()->count());
    }

    public function test_the_end_time_must_be_after_the_start_time(): void
    {
        $payload = $this->payload();
        $payload['template']['startTime'] = '12:00';
        $payload['template']['endTime'] = '10:00';

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $payload)
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'template.endTime')
            ->assertJsonPath('fields.0.reason', 'must_be_after');

        $this->assertSame(0, Event::query()->count());
    }

    public function test_an_unparseable_end_time_is_a_format_error_not_a_comparison(): void
    {
        // Pins the REPORTED REASON: told that '25:00' "doit être après le
        // début", the committee would go and check the start time, which is
        // not what is wrong.
        //
        // It does NOT pin the rule order, and the obvious assumption that it
        // does is wrong. MEASURED 2026-09-10 by reversing date_format and
        // after on template.endTime: this test still passes and the reason is
        // still invalid_format. EventWriteTest's equivalent for
        // StoreEventRequest::endsAt DOES flip under the same reversal, so the
        // two files genuinely differ — see StoreEventSeriesRequest's docblock.
        $payload = $this->payload();
        $payload['template']['endTime'] = '25:00';

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $payload)
            ->assertStatus(400)
            ->assertJsonPath('fields.0.field', 'template.endTime')
            ->assertJsonPath('fields.0.reason', 'invalid_format');
    }

    public function test_the_template_is_applied_to_every_event(): void
    {
        // NON-DEFAULT VALUES THROUGHOUT, for the reason Task 5's review found
        // the hard way: isPublic false and notes null are also the column
        // defaults, so a generator that never wrote those two columns passed
        // every assertion made against the default payload.
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload([
                'template' => [
                    'title' => 'Cortège',
                    'location' => 'Place Georges-Python',
                    'attire' => 'Costume complet',
                    'isPublic' => true,
                    'notes' => 'Rendez-vous une heure avant.',
                    'startTime' => '13:30',
                    'endTime' => '18:45',
                ],
                'dates' => ['2026-02-14', '2026-02-15'],
            ]))
            ->assertStatus(201);

        foreach (Event::query()->orderBy('starts_at')->get() as $event) {
            $this->assertSame('Cortège', $event->title);
            $this->assertSame('Place Georges-Python', $event->location);
            $this->assertSame('Costume complet', $event->attire);
            $this->assertTrue($event->is_public);
            $this->assertSame('Rendez-vous une heure avant.', $event->notes);
            $this->assertSame('13:30', $event->starts_at->setTimezone('Europe/Zurich')->format('H:i'));
            $this->assertSame('18:45', $event->ends_at->setTimezone('Europe/Zurich')->format('H:i'));
        }
    }

    public function test_a_season_does_not_cost_a_query_per_row_beyond_its_writes(): void
    {
        // Twenty rows is the first place in this project where one request
        // writes more than a handful, and this runs on a shared host. The
        // budget allows the inserts and the audit rows and little else — what
        // it catches is a SELECT sneaking into the loop.
        $dates = [];
        for ($i = 0; $i < 20; $i++) {
            $dates[] = now()->addWeeks($i)->format('Y-m-d');
        }

        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', $this->payload(['dates' => $dates]))
            ->assertStatus(201);

        // 20 inserts + 20 audit rows + the transaction and session overhead.
        $this->assertLessThanOrEqual(50, $queries, 'the series write should not SELECT per date');
    }

    public function test_generating_a_season_is_audited_once_per_event(): void
    {
        $this->actingAsMember($this->organiser)->postJson('/api/v1/events/series', $this->payload());

        $this->assertSame(3, DB::table('audit_log')->where('action', 'event.created')->count());

        // Each entry points at its own row, not three times at the last one:
        // an audit log whose target_id is the same for a whole season cannot
        // answer the only question anybody asks of it.
        $this->assertSame(
            Event::query()->orderBy('id')->pluck('id')->all(),
            DB::table('audit_log')->where('action', 'event.created')->orderBy('target_id')
                ->pluck('target_id')->map(fn ($id) => (int) $id)->all()
        );
    }
}

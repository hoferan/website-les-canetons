<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Who can see a draft. A draft is invisible to everyone without `events.manage`:
 * not in either list, not by id, not on the agenda, and not something a
 * member can answer or a guest can book.
 */
class EventDraftVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    private Member $player;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    /** @return list<int> */
    private function ids(Member $as, string $query = ''): array
    {
        return array_column(
            $this->actingAsMember($as)->getJson("/api/v1/events{$query}")->assertOk()->json('data'),
            'id',
        );
    }

    public function test_a_manager_sees_drafts_in_the_default_list_undated_first(): void
    {
        $dated = Event::factory()->create(['starts_at' => now()->addWeek(), 'ends_at' => now()->addWeek()->addHours(2)]);
        $draftDated = Event::factory()->draft()->create(['starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHours(2)]);
        $draftUndated = Event::factory()->draft()->create(['starts_at' => null, 'ends_at' => null, 'location' => null]);

        // The undated draft falls out of BOTH halves of the starts_at split
        // (NULL >= anything is false), so it is only here because drafts have
        // a query of their own.
        $this->assertSame(
            [$draftUndated->id, $draftDated->id, $dated->id],
            $this->ids($this->organiser),
        );
    }

    public function test_a_draft_never_appears_in_the_past_list(): void
    {
        $past = Event::factory()->past()->create();
        Event::factory()->draft()->past()->create();
        Event::factory()->draft()->create(['starts_at' => null, 'ends_at' => null]);

        $this->assertSame([$past->id], $this->ids($this->organiser, '?past=1'));
    }

    public function test_a_player_never_sees_a_draft_in_either_list(): void
    {
        $published = Event::factory()->create();
        $pastPublished = Event::factory()->past()->create();
        Event::factory()->draft()->public()->create();
        Event::factory()->draft()->public()->past()->create();
        Event::factory()->draft()->create(['starts_at' => null, 'ends_at' => null]);

        $this->assertSame([$published->id], $this->ids($this->player));
        $this->assertSame([$pastPublished->id], $this->ids($this->player, '?past=1'));
    }

    public function test_the_total_counts_only_what_the_caller_may_see(): void
    {
        Event::factory()->create();
        Event::factory()->draft()->create();

        $this->actingAsMember($this->player)->getJson('/api/v1/events')->assertJsonPath('meta.total', 1);
        $this->actingAsMember($this->organiser)->getJson('/api/v1/events')->assertJsonPath('meta.total', 2);
    }

    public function test_search_applies_to_drafts_too(): void
    {
        $match = Event::factory()->draft()->create(['title' => 'Souper de soutien', 'starts_at' => null, 'ends_at' => null]);
        Event::factory()->draft()->create(['title' => 'Répétition']);

        $this->assertSame([$match->id], $this->ids($this->organiser, '?q=souper'));
    }

    public function test_a_player_gets_404_for_a_draft_by_id(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($this->player)->getJson("/api/v1/events/{$draft->id}")->assertStatus(404);
    }

    public function test_a_manager_can_read_a_draft_by_id(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($this->organiser)->getJson("/api/v1/events/{$draft->id}")->assertOk();
    }

    public function test_a_player_cannot_answer_a_draft(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($this->player)
            ->putJson("/api/v1/events/{$draft->id}/attendance", ['status' => 'yes'])
            ->assertStatus(404);
        $this->actingAsMember($this->player)
            ->deleteJson("/api/v1/events/{$draft->id}/attendance")
            ->assertStatus(404);

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_a_manager_who_plays_cannot_answer_a_draft_either(): void
    {
        // Being able to SEE a draft is not being able to answer it: the answer
        // would sit on an event the rest of the band cannot see.
        $both = Member::factory()->administrator()->inSection('Trompettes')->create();
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($both)
            ->putJson("/api/v1/events/{$draft->id}/attendance", ['status' => 'yes'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'event_not_published');

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_a_manager_cannot_record_attendance_on_a_draft(): void
    {
        $draft = Event::factory()->draft()->create();

        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$draft->id}/attendance/{$this->player->id}", ['status' => 'yes'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'event_not_published');
        $this->actingAsMember($this->organiser)
            ->deleteJson("/api/v1/events/{$draft->id}/attendance/{$this->player->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'event_not_published');

        $this->assertSame(0, Attendance::query()->count());
    }

    public function test_the_chase_list_of_a_draft_is_hidden_from_a_non_manager(): void
    {
        $draft = Event::factory()->draft()->create();

        // attendance.view_all without events.manage: a role editor could grant
        // exactly this, and a draft must stay hidden from it.
        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceViewAll)->create())
            ->create();

        $this->actingAsMember($viewer)->getJson("/api/v1/events/{$draft->id}/attendance")->assertStatus(404);
        $this->actingAsMember($this->organiser)->getJson("/api/v1/events/{$draft->id}/attendance")->assertOk();
    }

    public function test_public_registration_of_a_draft_is_404_even_for_a_logged_in_manager(): void
    {
        $draft = Event::factory()->draft()->takingRegistrations()->create();

        $this->getJson("/api/v1/events/{$draft->id}/registration")->assertStatus(404);
        $this->actingAsMember($this->organiser)->getJson("/api/v1/events/{$draft->id}/registration")->assertStatus(404);

        // 404 BEFORE validation: an empty body would otherwise answer 400 and
        // tell a stranger the draft exists.
        $this->postJson(
            "/api/v1/events/{$draft->id}/registrations",
            $this->publicWriteBody([]),
            $this->publicWriteHeaders(),
        )->assertStatus(404);
        $this->actingAsMember($this->organiser)->postJson(
            "/api/v1/events/{$draft->id}/registrations",
            $this->publicWriteBody([]),
            $this->publicWriteHeaders(),
        )->assertStatus(404);
    }

    public function test_a_committee_member_gets_404_on_a_drafts_registrations(): void
    {
        $draft = Event::factory()->draft()->takingRegistrations()->create();
        $committee = Member::factory()->committee()->create();

        foreach (['registrations', 'registrations.json'] as $path) {
            $this->actingAsMember($committee)->getJson("/api/v1/events/{$draft->id}/{$path}")->assertStatus(404);
        }
        $this->actingAsMember($this->organiser)->getJson("/api/v1/events/{$draft->id}/registrations")->assertOk();
    }

    /**
     * A caller who holds NONE of a route's permissions must get the same answer
     * for a draft as for an id nothing matches. Otherwise the permission check
     * answers 403 for a draft that exists and 404 for one that does not, and a
     * member can count the drafts by walking an id range.
     *
     * @return array<string, array{0: string, 1: string}>
     */
    public static function routesTakingAnEvent(): array
    {
        return [
            'chase list' => ['GET', '/api/v1/events/%d/attendance'],
            'record for another' => ['PUT', '/api/v1/events/%d/attendance/1'],
            'withdraw for another' => ['DELETE', '/api/v1/events/%d/attendance/1'],
            'guest list' => ['GET', '/api/v1/events/%d/registrations'],
            'guest list export' => ['GET', '/api/v1/events/%d/registrations.json'],
            'booking options' => ['GET', '/api/v1/events/%d/registration-options'],
            'replace booking options' => ['PUT', '/api/v1/events/%d/registration-options'],
            'edit' => ['PATCH', '/api/v1/events/%d'],
            'delete' => ['DELETE', '/api/v1/events/%d'],
            'publish' => ['POST', '/api/v1/events/%d/publish'],
            'unpublish' => ['DELETE', '/api/v1/events/%d/publish'],
        ];
    }

    #[DataProvider('routesTakingAnEvent')]
    public function test_a_draft_answers_a_caller_without_permission_exactly_like_an_unknown_id(string $method, string $path): void
    {
        $draft = Event::factory()->draft()->create();
        $unknown = $draft->id + 1000;
        $nobody = Member::factory()->create();

        $forDraft = $this->actingAsMember($nobody)->json($method, sprintf($path, $draft->id), []);
        $forUnknown = $this->actingAsMember($nobody)->json($method, sprintf($path, $unknown), []);

        $forUnknown->assertStatus(404);
        $forDraft->assertStatus(404);
    }

    public function test_the_agenda_omits_a_public_draft(): void
    {
        $published = Event::factory()->public()->create();
        Event::factory()->draft()->public()->create();

        $ids = array_column($this->getJson('/api/v1/agenda')->assertOk()->json('data'), 'id');

        $this->assertSame([$published->id], $ids);
    }

    public function test_a_series_creates_only_drafts(): void
    {
        $this->actingAsMember($this->organiser)
            ->postJson('/api/v1/events/series', [
                'template' => [
                    'title' => 'Répétition',
                    'location' => 'Werkhof',
                    'attire' => null,
                    'isPublic' => false,
                    'notes' => null,
                    'startTime' => '20:00',
                    'endTime' => '22:00',
                ],
                'dates' => ['2027-01-12', '2027-01-19'],
            ])
            ->assertStatus(201);

        $this->assertSame(2, Event::query()->count());
        $this->assertSame(0, Event::query()->published()->count());
    }
}

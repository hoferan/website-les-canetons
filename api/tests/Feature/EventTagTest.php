<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventTag;
use App\Models\Member;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The tag list (#107): any member reads it, `events.manage` changes it.
 */
class EventTagTest extends TestCase
{
    use RefreshDatabase;

    private Member $manager;

    private Member $player;

    protected function setUp(): void
    {
        parent::setUp();
        $this->manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage)->create())
            ->create();
        $this->player = Member::factory()->inSection('Cloches')->create();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge(['labelFr' => 'Souper', 'labelDe' => 'Abendessen', 'colour' => 'coral', 'celebrate' => false], $overrides);
    }

    private function tag(string $labelFr): EventTag
    {
        return EventTag::query()->where('label_fr', $labelFr)->firstOrFail();
    }

    public function test_any_member_reads_the_list_in_tag_order_with_its_counts(): void
    {
        Event::factory()->create()->tags()->attach($this->tag('Concert'));
        // A draft counts: the count is what deleting the tag would touch.
        Event::factory()->create(['published_at' => null])->tags()->attach($this->tag('Concert'));

        $this->getJson('/api/v1/event-tags')->assertStatus(401);

        $this->actingAsMember($this->player)->getJson('/api/v1/event-tags')
            ->assertOk()
            ->assertJsonPath('data.0.labelFr', 'Répétition')
            ->assertJsonPath('data.0.labelDe', 'Probe')
            ->assertJsonPath('data.0.colour', 'violet')
            ->assertJsonPath('data.0.eventCount', 0)
            ->assertJsonPath('data.1.labelFr', 'Concert')
            ->assertJsonPath('data.1.eventCount', 2);
    }

    public function test_writes_need_a_session_then_the_permission(): void
    {
        $tag = $this->tag('Concert');

        $this->postJson('/api/v1/event-tags', $this->payload())
            ->assertStatus(401)->assertJson(['code' => 'not_authenticated']);
        $this->actingAsMember($this->player)->postJson('/api/v1/event-tags', $this->payload())
            ->assertStatus(403)->assertJson(['code' => 'access_denied']);
        $this->actingAsMember($this->player)->getJson("/api/v1/event-tags/{$tag->id}")
            ->assertStatus(403);
        $this->assertSame(4, EventTag::count());
    }

    public function test_a_new_tag_goes_last(): void
    {
        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('labelFr', 'Souper')
            ->assertJsonPath('colour', 'coral');

        $this->assertSame(5, $this->tag('Souper')->sort_order);
    }

    public function test_a_blank_german_label_is_stored_as_null(): void
    {
        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $this->payload(['labelDe' => '  ']))
            ->assertStatus(201)
            ->assertJsonPath('labelDe', null);
    }

    public function test_update_and_delete_need_the_current_tag(): void
    {
        $tag = $this->tag('Concert');

        $this->actingAsMember($this->manager)
            ->putJson("/api/v1/event-tags/{$tag->id}", $this->payload())
            ->assertStatus(428)->assertJson(['code' => 'if_match_required']);
        $this->actingAsMember($this->manager)
            ->withHeader('If-Match', '"stale"')
            ->deleteJson("/api/v1/event-tags/{$tag->id}")
            ->assertStatus(412)->assertJson(['code' => 'if_match_failed']);

        $this->actingAsMember($this->manager)
            ->withHeaders($this->ifMatch('event_tag', $tag))
            ->putJson("/api/v1/event-tags/{$tag->id}", $this->payload(['labelFr' => 'Concerts']))
            ->assertOk()
            ->assertJsonPath('labelFr', 'Concerts');
    }

    public function test_the_single_read_hands_out_the_tag(): void
    {
        $tag = $this->tag('Sortie');

        $this->actingAsMember($this->manager)->getJson("/api/v1/event-tags/{$tag->id}")
            ->assertOk()
            ->assertJsonPath('labelFr', 'Sortie')
            ->assertHeader('ETag');
    }

    public function test_deleting_a_tag_takes_it_off_its_events(): void
    {
        $tag = $this->tag('Concert');
        $event = Event::factory()->create();
        $event->tags()->attach($tag);

        $this->actingAsMember($this->manager)
            ->withHeaders($this->ifMatch('event_tag', $tag))
            ->deleteJson("/api/v1/event-tags/{$tag->id}")
            ->assertOk();

        $this->assertNull(EventTag::find($tag->id));
        $this->assertSame(0, $event->tags()->count());
    }

    public function test_a_label_that_differs_only_in_case_is_taken(): void
    {
        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $this->payload(['labelFr' => 'concert']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'labelFr')
            ->assertJsonPath('errors.0.reason', 'already_taken');
    }

    public function test_renaming_a_tag_to_its_own_label_is_not_taken(): void
    {
        $tag = $this->tag('Concert');

        $this->actingAsMember($this->manager)
            ->withHeaders($this->ifMatch('event_tag', $tag))
            ->putJson("/api/v1/event-tags/{$tag->id}", $this->payload(['labelFr' => 'Concert', 'colour' => 'blue']))
            ->assertOk()
            ->assertJsonPath('colour', 'blue');
    }

    public function test_an_unknown_colour_and_a_missing_label_are_refused(): void
    {
        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $this->payload(['colour' => 'purple']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'colour')
            ->assertJsonPath('errors.0.reason', 'invalid_value');

        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $this->payload(['labelFr' => ' ']))
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'labelFr')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_the_celebrate_flag_is_stored_and_read_back(): void
    {
        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $this->payload(['celebrate' => true]))
            ->assertStatus(201)
            ->assertJsonPath('celebrate', true);
        $this->assertTrue($this->tag('Souper')->celebrate);

        $tag = $this->tag('Souper');
        $this->actingAsMember($this->manager)
            ->withHeaders($this->ifMatch('event_tag', $tag))
            ->putJson("/api/v1/event-tags/{$tag->id}", $this->payload(['celebrate' => false]))
            ->assertOk()
            ->assertJsonPath('celebrate', false);

        $this->actingAsMember($this->player)->getJson('/api/v1/event-tags')
            ->assertJsonPath('data.0.celebrate', false)
            ->assertJsonPath('data.3.celebrate', true);
    }

    public function test_a_tag_written_without_the_flag_is_refused(): void
    {
        // A tag is replaced whole, so leaving the flag out would switch the
        // confetti off on every save from a client that forgot it.
        $payload = $this->payload();
        unset($payload['celebrate']);

        $this->actingAsMember($this->manager)
            ->postJson('/api/v1/event-tags', $payload)
            ->assertStatus(400)
            ->assertJsonPath('errors.0.field', 'celebrate')
            ->assertJsonPath('errors.0.reason', 'required');
    }

    public function test_a_change_to_the_flag_alone_moves_the_etag(): void
    {
        $tag = $this->tag('Concert');
        $before = $this->ifMatch('event_tag', $tag);
        $tag->update(['celebrate' => true]);

        $this->actingAsMember($this->manager)
            ->withHeaders($before)
            ->putJson("/api/v1/event-tags/{$tag->id}", $this->payload(['labelFr' => 'Concert', 'colour' => 'teal']))
            ->assertStatus(412);
    }
}

<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Image;
use App\Models\Member;
use App\Models\PhotoSlot;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Support\LibraryImage;
use Tests\TestCase;

/**
 * An event's poster (#228): a library photo in the photo slot `event-{id}`,
 * placed through PUT /photo-slots/{slot} like any other, and read back on the
 * event itself rather than from the public list of slots, so that only the
 * people who may see an event see its poster.
 */
class EventPosterTest extends TestCase
{
    use RefreshDatabase;

    private Member $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->manager = Member::factory()
            ->withRole(Role::factory()->granting(Permission::EventsManage, Permission::ImagesManage)->create())
            ->create();
    }

    public function test_the_planning_and_the_event_carry_its_poster(): void
    {
        $poster = $this->image('a');
        $event = Event::factory()->create();
        $bare = Event::factory()->create();
        $this->placePhoto(PhotoSlot::forEvent($event->id), $poster->id);

        $member = Member::factory()->create();
        $listed = collect($this->actingAsMember($member)->getJson('/api/v1/events')->assertOk()->json('data'))
            ->keyBy('id');

        $this->assertSame($this->photo($poster), $listed[$event->id]['poster']);
        $this->assertNull($listed[$bare->id]['poster']);

        $this->actingAsMember($member)
            ->getJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('poster', $this->photo($poster));
    }

    public function test_the_agenda_and_the_booking_form_carry_a_public_event_s_poster(): void
    {
        $poster = $this->image('a');
        $event = Event::factory()->public()->takingRegistrations()->create();
        $this->placePhoto(PhotoSlot::forEvent($event->id), $poster->id);

        $this->getJson('/api/v1/agenda')
            ->assertOk()
            ->assertJsonPath('data.0.poster', $this->photo($poster));

        $this->getJson("/api/v1/events/{$event->id}/registration")
            ->assertOk()
            ->assertJsonPath('event.poster', $this->photo($poster));
    }

    public function test_no_event_s_poster_is_in_the_public_list_of_slots(): void
    {
        $image = $this->image('a');
        $published = Event::factory()->public()->create();
        $draft = Event::factory()->draft()->create();
        $this->placePhoto(PhotoSlot::forEvent($published->id), $image->id);
        $this->placePhoto(PhotoSlot::forEvent($draft->id), $image->id);
        $this->placePhoto('band', $image->id);
        // A page may still name a slot of its own after events, as long as it
        // is not an event's id.
        $this->placePhoto('event-banner', $image->id);

        $slots = array_column($this->getJson('/api/v1/photo-slots')->assertOk()->json('data'), 'slot');

        $this->assertSame(['band', 'event-banner'], $slots);
    }

    public function test_a_draft_s_poster_reaches_only_the_people_who_see_the_draft(): void
    {
        $draft = Event::factory()->draft()->create();
        $this->placePhoto(PhotoSlot::forEvent($draft->id), $this->image('a')->id);

        $this->actingAsMember(Member::factory()->create())
            ->getJson("/api/v1/events/{$draft->id}")
            ->assertNotFound();

        $this->actingAsMember($this->manager)
            ->getJson("/api/v1/events/{$draft->id}")
            ->assertOk()
            ->assertJsonPath('poster.width', 800);
    }

    public function test_publishing_a_draft_keeps_its_poster(): void
    {
        $poster = $this->image('a');
        $draft = Event::factory()->draft()->create();
        $this->placePhoto(PhotoSlot::forEvent($draft->id), $poster->id);

        $this->actingAsMember($this->manager)
            ->withHeaders($this->ifMatch('event', $draft))
            ->postJson("/api/v1/events/{$draft->id}/publish")
            ->assertOk()
            ->assertJsonPath('poster', $this->photo($poster));
    }

    public function test_placing_a_poster_does_not_move_the_event_s_tag(): void
    {
        $event = Event::factory()->create();
        $before = $this->ifMatch('event', $event);

        $this->placePhoto(PhotoSlot::forEvent($event->id), $this->image('a')->id);

        // The poster has a write of its own, with no If-Match. Were it part
        // of the tag, the publish after it, which carries the tag the event's
        // save handed out, would answer 412.
        $this->assertSame($before, $this->ifMatch('event', $event->fresh()));
        $this->actingAsMember($this->manager)
            ->withHeaders($before)
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert annuel'])
            ->assertOk()
            ->assertJsonPath('poster.width', 800);
    }

    public function test_deleting_an_event_empties_its_poster_slot_and_no_other(): void
    {
        $image = $this->image('a');
        $event = Event::factory()->create();
        $other = Event::factory()->create();
        $this->placePhoto(PhotoSlot::forEvent($event->id), $image->id);
        $this->placePhoto(PhotoSlot::forEvent($other->id), $image->id);
        $this->placePhoto('band', $image->id);

        $this->actingAsMember($this->manager)
            ->withHeaders($this->ifMatch('event', $event))
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertOk();

        $this->assertNull($this->slotImage(PhotoSlot::forEvent($event->id)));
        $this->assertSame($image->id, $this->slotImage(PhotoSlot::forEvent($other->id)));
        $this->assertSame($image->id, $this->slotImage('band'));
    }

    public function test_a_longer_planning_with_more_posters_runs_no_more_queries(): void
    {
        $member = Member::factory()->create();
        $first = Event::factory()->create();
        $this->placePhoto(PhotoSlot::forEvent($first->id), $this->image('a')->id);

        // Warm up the session and the permission lookups, then count.
        $this->actingAsMember($member)->getJson('/api/v1/events')->assertOk();

        DB::enableQueryLog();
        $this->actingAsMember($member)->getJson('/api/v1/events')->assertOk();
        $few = count(DB::getQueryLog());

        foreach (['b', 'c', 'd', 'e'] as $seed) {
            $event = Event::factory()->create();
            $this->placePhoto(PhotoSlot::forEvent($event->id), $this->image($seed)->id);
        }

        DB::flushQueryLog();
        $this->actingAsMember($member)->getJson('/api/v1/events')->assertOk();
        $many = count(DB::getQueryLog());
        DB::disableQueryLog();

        $this->assertSame($few, $many, 'Listing more events with posters ran more queries.');
    }

    public function test_the_published_document_describes_the_poster_on_both_events(): void
    {
        $schemas = json_decode((string) file_get_contents(__DIR__.'/../../openapi.json'), true)['components']['schemas'];

        foreach (['EventResource', 'PublicEventResource'] as $schema) {
            $this->assertContains('poster', $schemas[$schema]['required'], "{$schema} does not require poster.");
            $poster = $schemas[$schema]['properties']['poster'];
            $this->assertSame(['object', 'null'], $poster['type'], "{$schema}.poster is not a nullable object.");
            $this->assertSame(['url', 'width', 'height', 'srcset'], $poster['required']);
        }
    }

    /** @return array{url: string, width: int, height: int, srcset: string} */
    private function photo(Image $image): array
    {
        return [
            'url' => LibraryImage::url($image, 800),
            'width' => 800,
            'height' => 600,
            'srcset' => LibraryImage::url($image, 480).' 480w, '.LibraryImage::url($image, 800).' 800w',
        ];
    }

    private function image(string $seed): Image
    {
        return LibraryImage::create(str_repeat($seed, 64), 800, 600, [800, 480]);
    }
}

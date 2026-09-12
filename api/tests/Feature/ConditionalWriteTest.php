<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\Role;
use App\Support\EntityTag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Conditional writes: the ETag a read hands out, and the If-Match a write owes.
 *
 * The bug this closes is live and unremarkable: two committee members with the
 * planning open, one moves a start time, the other clears the notes, and today
 * the second write silently discards the first. Requiring the header rather
 * than merely honouring it is the rigorous reading — a client that forgets it
 * is told so (428) instead of quietly overwriting somebody.
 */
class ConditionalWriteTest extends TestCase
{
    use RefreshDatabase;

    private Member $organiser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->organiser = Member::factory()->administrator()->create();
    }

    public function test_reading_an_event_hands_out_a_strong_entity_tag(): void
    {
        $event = Event::factory()->create();

        $tag = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$event->id}")
            ->assertOk()
            ->headers->get('ETag');

        // Strong, quoted, and not weak: RFC 9110 §13.1.1 compares If-Match
        // with the STRONG comparison function, so a `W/` prefix here would
        // make every tag this API hands out unusable for the one job it has.
        $this->assertIsString($tag);
        $this->assertMatchesRegularExpression('/^"[0-9a-f]{64}"$/', $tag);
    }

    public function test_a_write_without_if_match_is_refused_and_changes_nothing(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $this->actingAsMember($this->organiser)
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertStatus(428)
            ->assertJson(['code' => 'if_match_required']);

        // The refusal has to be a refusal to WRITE. A middleware that answered
        // 428 after the controller ran would pass the assertion above and
        // still have made the change it was refusing.
        $this->assertSame('Répétition', $event->fresh()->title);
    }

    public function test_a_write_quoting_a_stale_tag_is_refused_and_changes_nothing(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $stale = $this->tagFor($event);

        // Somebody else moves the start time. The tag the first client is
        // holding now describes a state that is gone.
        $event->update(['title' => 'Répétition générale']);

        $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', $stale)
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertStatus(412)
            ->assertJson(['code' => 'if_match_failed']);

        $this->assertSame('Répétition générale', $event->fresh()->title);
    }

    public function test_a_refused_write_is_not_told_the_current_tag(): void
    {
        $event = Event::factory()->create();

        $response = $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', '"nonsense"')
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertStatus(412);

        // Sending the current tag on the refusal would be a kindness that
        // defeats the mechanism: a client could retry blindly with it and land
        // exactly the overwrite it was just stopped from making. The fix for a
        // 412 is to re-read and re-decide.
        $this->assertNull($response->headers->get('ETag'));
    }

    public function test_a_write_quoting_the_current_tag_succeeds_and_hands_back_the_new_one(): void
    {
        $event = Event::factory()->create(['title' => 'Répétition']);

        $before = $this->tagFor($event);

        $response = $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', $before)
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertOk();

        $this->assertSame('Concert', $event->fresh()->title);

        // The tag on the way out describes the state the write just produced,
        // not the one it was checked against — so a client editing twice in a
        // row never has to re-read between them.
        $after = $response->headers->get('ETag');
        $this->assertIsString($after);
        $this->assertNotSame($before, $after);
        $this->assertSame($this->tagFor($event->fresh()), $after);
    }

    public function test_the_lost_update_two_committee_members_produce_is_refused(): void
    {
        // The scenario the whole mechanism exists for, written out: both have
        // the planning open, each sends only their own field, and before this
        // the second write silently discarded the first.
        $event = Event::factory()->create(['title' => 'Répétition', 'notes' => 'Apporter la partition']);

        $bothRead = $this->tagFor($event);

        $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', $bothRead)
            ->patchJson("/api/v1/events/{$event->id}", ['notes' => null])
            ->assertOk();

        $second = Member::factory()->administrator()->create();

        $this->actingAsMember($second)
            ->withHeader('If-Match', $bothRead)
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertStatus(412);

        // The first write survives, and the second is told to re-read rather
        // than being given the overwrite it asked for.
        $this->assertSame('Répétition', $event->fresh()->title);
        $this->assertNull($event->fresh()->notes);
    }

    public function test_a_delete_is_conditional_too(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertStatus(428);

        $this->assertModelExists($event);

        $response = $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', $this->tagFor($event))
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertOk();

        $this->assertModelMissing($event);

        // Nothing to tag once it is gone. An ETag here would name a thing that
        // no longer exists.
        $this->assertNull($response->headers->get('ETag'));
    }

    public function test_an_events_tag_does_not_depend_on_who_is_asking(): void
    {
        // EventResource carries `myAttendance`, the CALLER's own answer. If the
        // tag were computed from the rendered response body, two committee
        // members would hold different tags for the same event — and a member
        // answering an event would invalidate their own pending edit of it.
        $event = Event::factory()->create();

        $answering = Member::factory()->administrator()->inSection('Cloches')->create();

        $before = $this->actingAsMember($answering)
            ->getJson("/api/v1/events/{$event->id}")
            ->headers->get('ETag');

        $this->actingAsMember($answering)
            ->putJson("/api/v1/events/{$event->id}/attendance", ['status' => 'yes'])
            ->assertOk();

        $after = $this->actingAsMember($answering)
            ->getJson("/api/v1/events/{$event->id}")
            ->headers->get('ETag');

        $this->assertSame($before, $after);
        $this->assertSame($before, $this->tagFor($event));
    }

    public function test_a_weak_tag_never_matches(): void
    {
        $event = Event::factory()->create();

        // RFC 9110 §13.1.1: If-Match uses the STRONG comparison function, under
        // which a weak tag matches nothing. This API never emits one, so the
        // only way a client sends this is by having invented it — and inventing
        // a validator is exactly what must not be allowed to work.
        $weak = 'W/'.$this->tagFor($event);

        $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', $weak)
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertStatus(412);
    }

    public function test_a_list_of_tags_matches_if_any_entry_does(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', '"aaa", '.$this->tagFor($event).', "bbb"')
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertOk();
    }

    public function test_if_match_star_asserts_only_that_the_thing_exists(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->withHeader('If-Match', '*')
            ->patchJson("/api/v1/events/{$event->id}", ['title' => 'Concert'])
            ->assertOk();
    }

    public function test_a_role_change_moves_a_members_tag(): void
    {
        // THE REASON THE MEMBER FACET IS COMPUTED OVER THE RESOURCE. Roles live
        // in a pivot table, so `members.updated_at` does not move when they
        // change — a timestamp validator would let one administrator's grant be
        // silently discarded by another's, which is the worst lost update in
        // the system and the one with no shell to repair it from.
        // MemberResource publishes `roleIds`, so this tag moves.
        $target = Member::factory()->inSection('Cloches')->create();

        $before = EntityTag::compute('member', $target);

        $target->roles()->attach(Role::query()->where('key', 'committee')->firstOrFail());

        $this->assertNotSame($before, EntityTag::compute('member', $target));
    }

    public function test_replacing_a_members_roles_is_conditional(): void
    {
        $target = Member::factory()->inSection('Cloches')->create();
        $committee = Role::query()->where('key', 'committee')->firstOrFail();

        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/members/{$target->id}/roles", ['roleIds' => [$committee->id]])
            ->assertStatus(428);

        $this->assertSame(0, $target->fresh()->roles()->count());

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('member', $target))
            ->putJson("/api/v1/members/{$target->id}/roles", ['roleIds' => [$committee->id]])
            ->assertOk();

        $this->assertSame(1, $target->fresh()->roles()->count());
    }

    public function test_an_events_options_are_tagged_apart_from_the_event(): void
    {
        // THE REASON event.options IS ITS OWN FACET. The options are absent
        // from EventResource, so conditioning their write on the event's tag
        // would be wrong in both directions: an option change would not move
        // the tag at all (a lost update straight through), and correcting the
        // dress code would refuse a perfectly good options edit.
        $event = Event::factory()->create(['attire' => 'Costume']);

        $options = EntityTag::compute('event.options', $event);

        $event->update(['attire' => 'Libre']);

        $this->assertSame($options, EntityTag::compute('event.options', $event));

        $this->actingAsMember($this->organiser)
            ->withHeaders($this->ifMatch('event.options', $event))
            ->putJson("/api/v1/events/{$event->id}/registration-options", [
                'options' => [['label' => 'Jambon', 'priceCents' => 2500]],
            ])
            ->assertOk();

        $this->assertNotSame($options, EntityTag::compute('event.options', $event));
    }

    public function test_replacing_an_events_options_is_conditional(): void
    {
        $event = Event::factory()->create();

        $this->actingAsMember($this->organiser)
            ->putJson("/api/v1/events/{$event->id}/registration-options", [
                'options' => [['label' => 'Jambon', 'priceCents' => 2500]],
            ])
            ->assertStatus(428);

        $this->assertSame(0, $event->registrationOptions()->count());
    }

    public function test_reading_a_member_and_a_booking_hands_out_the_tag_their_writes_need(): void
    {
        // These two have no other read: the roster and the guest list hand out
        // no tag, because one tag cannot validate forty-five rows. Without
        // these endpoints the conditional writes on them would be unreachable
        // rather than merely strict.
        $target = Member::factory()->inSection('Cloches')->create();

        $memberTag = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/members/{$target->id}")
            ->assertOk()
            ->headers->get('ETag');

        $this->assertSame(EntityTag::compute('member', $target), $memberTag);

        $registration = Registration::factory()->create();

        $bookingTag = $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/registrations/{$registration->id}")
            ->assertOk()
            ->headers->get('ETag');

        $this->assertSame(EntityTag::compute('registration', $registration), $bookingTag);
    }

    public function test_the_tag_describes_what_is_stored_not_what_is_in_hand(): void
    {
        // The tag answers "what is in the database", and a model in hand can
        // say something else — the attributes a request is about to write, or
        // an edit a caller made and has not saved. Without the re-read in
        // EntityTag::compute() a write would be compared against itself and
        // every If-Match would match, which is a mechanism that reports success
        // and enforces nothing.
        $event = Event::factory()->create(['title' => 'Répétition']);

        $stored = EntityTag::compute('event', $event);

        $event->title = 'Concert';

        $this->assertSame($stored, EntityTag::compute('event', $event));
    }

    public function test_an_unknown_id_is_a_404_and_not_a_precondition_refusal(): void
    {
        // ORDERING, and it is not free: this middleware asks what is STORED, so
        // it has to run after route-model binding. Ahead of it, it would see a
        // raw id string, find nothing to tag, and answer 428 for a thing that
        // does not exist — turning every unknown id into a lecture about a
        // header. Proved against a route that is known to work: the same verb
        // on an id that resolves is exercised throughout this file.
        $this->actingAsMember($this->organiser)
            ->patchJson('/api/v1/events/999999', ['title' => 'X'])
            ->assertStatus(404)
            ->assertJson(['code' => 'not_found']);
    }

    public function test_a_caller_without_the_permission_is_refused_before_the_header_is_considered(): void
    {
        // 403, not 428, and with no If-Match sent at all. "You may not do this"
        // and "you did not say which version" are answers to different
        // questions, and telling somebody to go and fetch a tag for a write
        // they will never be allowed to make is the wrong one.
        $event = Event::factory()->create();

        $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->deleteJson("/api/v1/events/{$event->id}")
            ->assertStatus(403)
            ->assertJson(['code' => 'access_denied']);

        $this->assertModelExists($event);
    }

    public function test_every_facet_a_route_may_name_can_actually_be_computed(): void
    {
        // App\Support\EntityTag::state() has no default arm, so a facet added
        // to the list and not to the match throws UnhandledMatchError — from
        // inside a middleware, on a write, in production. Walking the list here
        // is what turns that into a test failure instead.
        $models = [
            'event' => Event::factory()->create(),
            'event.options' => Event::factory()->create(),
            'member' => Member::factory()->inSection('Cloches')->create(),
            'registration' => Registration::factory()->create(),
        ];

        foreach (EntityTag::facets() as $facet) {
            $this->assertArrayHasKey($facet, $models, "No fixture here for the facet `{$facet}`.");
            $this->assertIsString(EntityTag::compute($facet, $models[$facet]));
        }
    }

    public function test_the_published_document_declares_every_conditional_route(): void
    {
        // DERIVED FROM THE ROUTES, not from a list written out here, so a
        // thirteenth conditional route is covered without an edit — and a route
        // that gains `etag:` while App\Support\Scramble\DocumentsFailureModes
        // stops being called fails here. A Scramble extension that quietly
        // stops running changes nothing and says nothing, which is the failure
        // this whole family of tests exists for.
        $document = json_decode(
            (string) file_get_contents(__DIR__.'/../../openapi.json'),
            true,
        );

        $this->assertIsArray($document, 'api/openapi.json did not parse; every assertion below would be vacuous.');

        $checked = 0;
        $wrong = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            if (! in_array('etag', array_map(
                fn (string $entry): string => explode(':', $entry)[0],
                array_filter($route->gatherMiddleware(), 'is_string'),
            ), true)) {
                continue;
            }

            // Scramble strips the configured api_path, so `api/v1/events/{event}`
            // is published as `/events/{event}`.
            $path = '/'.ltrim(substr($route->uri(), strlen('api/v1')), '/');

            foreach ($route->methods() as $verb) {
                if ($verb === 'HEAD') {
                    continue;
                }

                $operation = $document['paths'][$path][strtolower($verb)] ?? null;

                if ($operation === null) {
                    $wrong[] = "{$verb} {$path}: absent from the document";

                    continue;
                }

                $checked++;

                $conditioned = in_array($verb, ['PUT', 'PATCH', 'DELETE'], true);
                $headers = array_column(
                    array_filter($operation['parameters'] ?? [], fn ($p) => ($p['in'] ?? null) === 'header'),
                    'name',
                );
                $statuses = array_map('intval', array_keys($operation['responses'] ?? []));

                if ($conditioned && ! in_array('If-Match', $headers, true)) {
                    $wrong[] = "{$verb} {$path}: does not declare the If-Match header it requires";
                }

                foreach ($conditioned ? [412, 428] : [] as $status) {
                    if (! in_array($status, $statuses, true)) {
                        $wrong[] = "{$verb} {$path}: does not declare {$status}";
                    }
                }

                // A DELETE is the one that must NOT promise a tag: there is
                // nothing left to tag, and a client told to expect one would be
                // reading a header the API deliberately does not send.
                $tagged = [];
                foreach ($operation['responses'] ?? [] as $status => $response) {
                    if ((int) $status < 300 && isset($response['headers']['ETag'])) {
                        $tagged[] = (int) $status;
                    }
                }

                if ($verb === 'DELETE' && $tagged !== []) {
                    $wrong[] = "{$verb} {$path}: promises an ETag on a response that has nothing to tag";
                }

                if ($verb !== 'DELETE' && $tagged === []) {
                    $wrong[] = "{$verb} {$path}: hands out no ETag, so its own writes are unreachable";
                }
            }
        }

        // The floor. Twelve operations carry `etag:` today; a scan that stopped
        // matching would otherwise report a clean document it never read.
        $this->assertGreaterThanOrEqual(12, $checked, 'Found almost no conditional routes; this test is reading the wrong thing.');

        $this->assertSame([], $wrong, "The document and the routes disagree:\n  - ".implode("\n  - ", $wrong));
    }

    /** The tag the API would hand out for this event right now. */
    private function tagFor(Event $event): string
    {
        return (string) $this->actingAsMember($this->organiser)
            ->getJson("/api/v1/events/{$event->id}")
            ->headers->get('ETag');
    }
}

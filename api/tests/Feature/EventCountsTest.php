<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\EventController;
use App\Http\Resources\EventResource;
use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Models\Registration;
use App\Models\RegistrationOption;
use App\Models\Role;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Tests\TestCase;

/**
 * The counts behind the planning's metadata strip (#93).
 *
 * THE GATE IS THE API, NOT THE SPA. Knowing that twelve people have already
 * said yes can move a thirteenth person's own answer, so the count is not
 * merely something a player has no use for — it would change what the screen
 * is measuring. A count left on the wire and hidden by can() is readable in
 * the network tab.
 */
class EventCountsTest extends TestCase
{
    use RefreshDatabase;

    private Event $event;

    protected function setUp(): void
    {
        parent::setUp();
        $this->event = Event::factory()->create();
    }

    /** Somebody who may read the chase list and nothing else. */
    private function answerViewer(): Member
    {
        return Member::factory()
            ->withRole(Role::factory()->granting(Permission::AttendanceViewAll)->create())
            ->create();
    }

    public function test_a_player_is_told_nothing_about_answers(): void
    {
        // THE LEAK TEST. Mutation-test it by hand: drop the ternary in
        // EventResource and this must go red.
        Attendance::factory()->create(['event_id' => $this->event->id]);

        $response = $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertNull($response->json('data.0.answeredCount'));
        $this->assertNull($response->json('data.0.answerableCount'));
    }

    public function test_attendance_view_all_sees_the_fraction(): void
    {
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        // One answer; three members in a register — the answering player, the
        // one just created, and nobody else. The viewer holds a role but no
        // register, so they are not answerable and not counted.
        $this->assertSame(1, $response->json('data.0.answeredCount'));
        $this->assertSame(2, $response->json('data.0.answerableCount'));
    }

    public function test_an_answer_from_somebody_who_left_their_register_is_not_counted(): void
    {
        // Otherwise the fraction reads 1/0, and the strip disagrees with the
        // chase list it links to — which lists players only.
        $departed = Member::factory()->inSection('Cloches')->create();
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $departed->id,
        ]);
        $departed->update(['section_id' => null]);

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertSame(0, $response->json('data.0.answeredCount'));
        $this->assertSame(0, $response->json('data.0.answerableCount'));
    }

    public function test_listing_the_planning_for_the_committee_costs_a_fixed_number_of_queries(): void
    {
        // The player path is pinned at <= 3 by EventIndexTest and stays there.
        // This is the path that grew: resolving permissions, and the
        // denominator a player never pays for.
        Event::factory()->count(20)->create();
        $viewer = $this->answerViewer();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();

        $this->assertLessThanOrEqual(
            4,
            $queries,
            'GET /api/v1/events should not scale queries with events',
        );
    }

    public function test_a_player_is_told_nothing_about_bookings(): void
    {
        $event = Event::factory()->takingRegistrations()->create();
        $option = RegistrationOption::factory()->create(['event_id' => $event->id]);
        Registration::factory()
            ->withChoice($option, 4)
            ->create(['event_id' => $event->id]);

        $response = $this->actingAsMember(Member::factory()->inSection('Cloches')->create())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertNull($response->json('data.1.guestCount'));
    }

    public function test_guest_count_sums_quantities_rather_than_counting_bookings(): void
    {
        // "3 x adulte, 1 x enfant" is four people, and four is what fills the
        // hall. One booking that reads "1" is the bug this pins.
        $event = Event::factory()->takingRegistrations()->create();
        $option = RegistrationOption::factory()->create(['event_id' => $event->id]);
        Registration::factory()
            ->withChoice($option, 4)
            ->create(['event_id' => $event->id]);

        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::RegistrationsView)->create())
            ->create();

        $response = $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();
        $row = collect($response->json('data'))->firstWhere('id', $event->id);

        $this->assertSame(4, $row['guestCount']);
    }

    public function test_the_two_gates_are_independent(): void
    {
        // demo.committee holds registrations.view WITHOUT attendance.view_all.
        // Anything that collapses these into one "committee" check breaks this
        // member, the way demo.both breaks an either/or role matrix.
        Attendance::factory()->create(['event_id' => $this->event->id]);

        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(Permission::RegistrationsView)->create())
            ->create();

        $response = $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();

        $this->assertNull($response->json('data.0.answeredCount'));
        $this->assertNull($response->json('data.0.answerableCount'));
        $this->assertSame(0, $response->json('data.0.guestCount'));
    }

    public function test_reading_one_event_carries_the_same_counts_as_the_list(): void
    {
        // One Resource, one shape. A client reading a single event should not
        // have to fetch a list to learn the denominator.
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson("/api/v1/events/{$this->event->id}")
            ->assertOk();

        // No `data.` prefix: JsonResource::withoutWrapping() (see
        // AppServiceProvider::boot()) means a single-resource response is not
        // enveloped, unlike the collection in the test above it. Every other
        // single-event test in this suite reads the same way — see
        // EventIndexTest::test_it_shows_one_event and
        // MyAttendanceTest::test_it_never_shows_somebody_elses_answer.
        $this->assertSame(1, $response->json('answeredCount'));
        $this->assertSame(2, $response->json('answerableCount'));
    }

    /**
     * GUARD A IN ISOLATION — the not-loaded guard (`array_key_exists()` in
     * `EventResource::countOrNull()`/`guestCountOrNull()`).
     *
     * An AUTHORIZED caller (holds both attendance.view_all and
     * registrations.view, so every gate passes and Guard B does not fire)
     * renders an event whose aggregates were NEVER loaded — the shape a
     * controller produces if it forgets `->withCount(EventController::
     * counts())` / `->withSum('registrationChoices as guest_count', ...)`.
     * This is the write-path case: a controller that forgets to load the
     * aggregates must answer null rather than a wrong number or a crash.
     *
     * Goes red if the `array_key_exists()` early-return is removed, because
     * reading the missing attribute then throws instead of answering null.
     *
     * TWO OF THE THREE ASSERTIONS EXERCISE THE GUARD, not all three.
     * `answerableCount` never passes through `countOrNull()` at all — it reads
     * the `ANSWERABLE_COUNT` request attribute, which no unit-style render
     * sets, so it is null here whatever Guard A does. It is asserted for shape
     * rather than as evidence; `answeredCount` and `guestCount` are what this
     * test actually pins.
     */
    public function test_unloaded_aggregates_render_as_null_for_an_authorized_caller(): void
    {
        $viewer = Member::factory()
            ->withRole(Role::factory()->granting(
                Permission::AttendanceViewAll,
                Permission::RegistrationsView,
            )->create())
            ->create();

        $request = Request::create('/');
        $request->setUserResolver(fn () => $viewer);

        $resource = (new EventResource($this->event))->toArray($request);

        $this->assertNull($resource['answeredCount']);
        $this->assertNull($resource['answerableCount']);
        $this->assertNull($resource['guestCount']);
    }

    /**
     * GUARD B IN ISOLATION — the no-caller guard (`permissionsFor()`
     * resolving an unauthenticated request's permission set to empty).
     *
     * A bare, unauthenticated `Request::create('/')` — exactly what
     * `EntityTag::state()` renders `EventResource` through — with the
     * aggregates already LOADED, as a controller normally loads them. Guard
     * A alone would let these loaded values through; only Guard B (no user
     * -> empty permission set -> maySeeAnswers()/maySeeGuests() false) keeps
     * them out. This is exactly the regression a reviewer proved: loading
     * the aggregates inside EntityTag::state() defeats Guard A, and nothing
     * but Guard B stops the counts reaching the tag.
     *
     * Goes red if `permissionsFor()` ever resolves a bare request's
     * permission set to anything but empty.
     *
     * As in the test above, `answerableCount` is null here for its own reason
     * — its request attribute is never set — so the evidence is carried by
     * `answeredCount` and `guestCount`, whose aggregates ARE loaded.
     */
    public function test_loaded_aggregates_render_as_null_for_a_bare_request(): void
    {
        $event = $this->event->fresh();
        $event->loadCount(EventController::counts());
        $event->loadSum('registrationChoices as guest_count', 'quantity');

        $resource = (new EventResource($event))->toArray(Request::create('/'));

        $this->assertNull($resource['answeredCount']);
        $this->assertNull($resource['answerableCount']);
        $this->assertNull($resource['guestCount']);
    }
}

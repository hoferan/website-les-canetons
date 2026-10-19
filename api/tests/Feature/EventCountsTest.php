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
 * The API withholds the counts, since a count hidden only by can() is still
 * readable in the network tab. Knowing that twelve people have said yes can
 * move a thirteenth person's own answer, which would change what the screen
 * measures.
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
        // The leak test: dropping the ternary in EventResource must turn it red.
        Attendance::factory()->create(['event_id' => $this->event->id]);

        $response = $this->actingAsMember(Member::factory()->inSection('Cloches')->musician()->create())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertNull($response->json('data.0.answeredCount'));
        $this->assertNull($response->json('data.0.answerableCount'));
    }

    public function test_attendance_view_all_sees_the_fraction(): void
    {
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->musician()->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        // One answer; two holders of attendance.respond (the answering player
        // and the one just created). The viewer is not a musician, so not counted.
        $this->assertSame(1, $response->json('data.0.answeredCount'));
        $this->assertSame(2, $response->json('data.0.answerableCount'));
    }

    public function test_an_answer_from_somebody_who_lost_attendance_respond_is_not_counted(): void
    {
        // Otherwise the fraction reads 1/0 and disagrees with the chase list it
        // links to, which lists holders of the permission only.
        $departed = Member::factory()->inSection('Cloches')->musician()->create();
        Attendance::factory()->create([
            'event_id' => $this->event->id,
            'member_id' => $departed->id,
        ]);
        $departed->roles()->detach(Role::where('key', 'musician')->sole()->id);

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertSame(0, $response->json('data.0.answeredCount'));
        $this->assertSame(0, $response->json('data.0.answerableCount'));
    }

    public function test_the_register_does_not_decide_who_is_counted(): void
    {
        // A musician with no register counts, and a register with no musician
        // does not. Two of the first and one of the second, all answered, so
        // counting by register would read 1/1 where the right answer is 2/2.
        // With one of each, both rules read 1/1 and this test could not fail.
        $answered = [
            Member::factory()->musician()->create(),
            Member::factory()->musician()->create(),
            Member::factory()->inSection('Cloches')->create(),
        ];
        foreach ($answered as $member) {
            Attendance::factory()->create(['event_id' => $this->event->id, 'member_id' => $member->id]);
        }

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson('/api/v1/events')
            ->assertOk();

        $this->assertSame(2, $response->json('data.0.answeredCount'));
        $this->assertSame(2, $response->json('data.0.answerableCount'));
    }

    public function test_listing_the_planning_for_the_committee_costs_a_fixed_number_of_queries(): void
    {
        // The player path is pinned by EventIndexTest. This one adds resolving
        // permissions and the denominator, which a player never pays for.
        Event::factory()->count(20)->create();
        $viewer = $this->answerViewer();

        $queries = 0;
        \DB::listen(function () use (&$queries) {
            $queries++;
        });

        $this->actingAsMember($viewer)->getJson('/api/v1/events')->assertOk();

        // The event tags (#107) and the posters (#228) are each one eager load
        // for the whole list.
        $this->assertLessThanOrEqual(
            6,
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
        $row = collect($response->json('data'))->firstWhere('id', $event->id);

        $this->assertNull($row['guestCount']);
    }

    public function test_guest_count_sums_quantities_rather_than_counting_bookings(): void
    {
        // "3 x adulte, 1 x enfant" is four people, and four is what fills the
        // hall, so the booking must not count as 1.
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
        // demo.committee holds registrations.view without attendance.view_all,
        // so collapsing both into one "committee" check breaks that member.
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
        // A client reading a single event should not have to fetch a list to
        // learn the denominator.
        Attendance::factory()->create(['event_id' => $this->event->id]);
        Member::factory()->inSection('Trompettes')->musician()->create();

        $response = $this->actingAsMember($this->answerViewer())
            ->getJson("/api/v1/events/{$this->event->id}")
            ->assertOk();

        // No `data.` prefix: JsonResource::withoutWrapping() (in
        // AppServiceProvider::boot()) leaves a single resource unenveloped.
        $this->assertSame(1, $response->json('answeredCount'));
        $this->assertSame(2, $response->json('answerableCount'));
    }

    /**
     * Guard A in isolation: the not-loaded guard (`array_key_exists()` in
     * `EventResource::countOrNull()`/`guestCountOrNull()`).
     *
     * An authorized caller (every gate passes, so Guard B does not fire)
     * renders an event whose aggregates were never loaded, as happens when a
     * controller forgets `->withCount(EventController::counts())` or
     * `->withSum('registrationChoices as guest_count', ...)`. It must answer
     * null rather than a wrong number or a crash. Removing the early return
     * makes reading the missing attribute throw.
     *
     * Only `answeredCount` and `guestCount` exercise the guard.
     * `answerableCount` reads the `ANSWERABLE_COUNT` request attribute, which
     * no unit-style render sets, so it is asserted for shape only.
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
     * Guard B in isolation: the no-caller guard (`EffectivePermissions::ofRequest()`
     * resolving an unauthenticated request's permission set to empty).
     *
     * A bare `Request::create('/')`, which is what `EntityTag::state()`
     * renders `EventResource` through, with the aggregates already loaded.
     * Guard A would let these values through; only Guard B (no user, so an
     * empty permission set, so maySeeAnswers()/maySeeGuests() false) keeps
     * them out. Loading the aggregates inside EntityTag::state() would defeat
     * Guard A, leaving Guard B as the only thing between the counts and the tag.
     *
     * As above, `answerableCount` is null because its request attribute is
     * never set, so `answeredCount` and `guestCount` carry the evidence.
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

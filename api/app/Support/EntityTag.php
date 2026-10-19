<?php

namespace App\Support;

use App\Http\Resources\ContactMessageResource;
use App\Http\Resources\EventResource;
use App\Http\Resources\EventTagResource;
use App\Http\Resources\HistoryEntryResource;
use App\Http\Resources\ImageResource;
use App\Http\Resources\MemberResource;
use App\Http\Resources\RegistrationOptionResource;
use App\Http\Resources\RegistrationResource;
use App\Http\Resources\RoleResource;
use App\Http\Resources\SectionResource;
use App\Models\Event;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * The entity tag a conditional write is checked against.
 *
 * RFC 9110 §8.8.3: a strong validator over one thing's state, handed out by
 * the read that renders it and quoted back by the write that changes it, so a
 * write can be refused when the state moved underneath the client. See
 * App\Http\Middleware\ConditionalWrite.
 *
 * Derived from the Resource, not from the columns. A hand-written list of the
 * fields that count is a list somebody forgets to extend, and a forgotten
 * field is a change the tag does not move for: the lost update this exists to
 * catch. Rendering the Resource covers a new field as soon as it is added. It
 * also covers the roster's tag: a member's roles live in a pivot table, so
 * `members.updated_at` does not move when they change, but MemberResource
 * carries `roleIds`.
 *
 * Rendered without a caller. EventResource's `myAttendance` is the caller's own
 * answer, so a tag over a rendered response body would differ between two
 * committee members looking at the same event, and a member answering an event
 * would invalidate their own pending edit of it. See state().
 *
 * Strong, not weak (`W/`): RFC 9110 §13.1.1 compares If-Match with the strong
 * comparison function. The bytes a GET sends do carry `myAttendance`, which
 * makes the tag formally a weak validator of them. That is accepted because
 * every route that hands one out also sends `Cache-Control: no-store`, and this
 * API implements no conditional GET (`If-None-Match`).
 *
 * Always re-read from the database, because the question is what is stored
 * and a model in hand may say something else. Inside the middleware the bound
 * instance happens to agree, but compute() is also called from the test helper
 * and elsewhere with a model somebody has already touched. Pinned by
 * test_the_tag_describes_what_is_stored_not_what_is_in_hand.
 */
final class EntityTag
{
    /**
     * facet => the route parameter it is read from
     *
     * A facet is a tagged thing, which is not always a whole row: an event's
     * bookable options are replaced wholesale by their own endpoint and are
     * absent from EventResource, so conditioning that write on the event's tag
     * would both miss every option change and 412 on an unrelated title edit.
     * They get their own facet over the same bound model instead.
     *
     * Every name here needs an arm in state() below. There is no default arm,
     * so a facet added to one and not the other throws instead of tagging the
     * wrong thing, and test_every_facet_can_be_computed walks this list.
     *
     * @var array<string, string>
     */
    private const FACETS = [
        'event' => 'event',
        'event.options' => 'event',
        'member' => 'member',
        'registration' => 'registration',
        'contact_message' => 'contactMessage',
        'history' => 'historyEntry',
        'image' => 'image',
        'event_tag' => 'eventTag',
        'role' => 'role',
        'section' => 'section',
    ];

    /**
     * The facet names a route may condition on, for the middleware and the tests.
     *
     * @return list<string>
     */
    public static function facets(): array
    {
        return array_keys(self::FACETS);
    }

    /** The route parameter a facet is read from. */
    public static function parameter(string $facet): string
    {
        return self::FACETS[$facet];
    }

    /**
     * The tag for one facet of whatever this request has bound, or null when
     * the thing is gone (a DELETE's own response, or a row another request
     * removed between the read and the write).
     */
    public static function of(string $facet, Request $request): ?string
    {
        $bound = $request->route(self::parameter($facet));

        return $bound instanceof Model ? self::compute($facet, $bound) : null;
    }

    /**
     * The tag for one facet of a model in hand, or null when the row is gone.
     *
     * Separate from of() so a test can ask for the header a conditional write
     * owes without an HTTP round trip first (see Tests\TestCase::ifMatch()).
     * The middleware and the tests read the tag through the same code, so a
     * test helper cannot pass while the API refuses.
     */
    public static function compute(string $facet, Model $model): ?string
    {
        // Re-read, never reuse: see the note on the class.
        $current = $model->newQuery()->find($model->getKey());

        if ($current === null) {
            return null;
        }

        return self::hash(self::state($facet, $current));
    }

    /**
     * A quoted, strong entity tag.
     *
     * sha256 rather than a shorter digest: this is computed at most twice per
     * request over a few hundred bytes, so the cost is negligible, and a
     * truncated digest would need an argument about collisions.
     *
     * @param  array<mixed>  $state
     */
    private static function hash(array $state): string
    {
        return '"'.hash('sha256', json_encode($state, JSON_THROW_ON_ERROR)).'"';
    }

    /**
     * A request with no authenticated caller, so the rendering below cannot
     * accidentally include anything that depends on who is asking.
     */
    private static function bare(): Request
    {
        return Request::create('/');
    }

    /**
     * What one facet's tag is computed over, rendered through the same Resource
     * the API renders (see the class note).
     *
     * The default arm throws. Falling back to another facet's state would make
     * every write on that route pass a check it never performed.
     *
     * Nothing is loaded for the event, which keeps `myAttendance` (the caller's
     * own answer) out of its tag: compute() hands this a freshly read model with
     * no relations, and EventResource reports null for an unloaded one. Pinned
     * by test_an_events_tag_does_not_depend_on_who_is_asking; a `load` added
     * here would break it. The others load exactly what their Resource
     * publishes: a member's roles because a role change must move the tag,
     * their section because the Resource names it, and a booking's line items
     * because they are what it is.
     *
     * @return array<mixed>
     */
    private static function state(string $facet, Model $model): array
    {
        return match ($facet) {
            // Without the poster, which has a write of its own with no If-Match.
            // The form writes it between the event's save and the publish, and
            // the publish carries the tag that save handed out.
            'event' => array_diff_key(
                (new EventResource($model))->toArray(self::bare()),
                ['poster' => true],
            ),

            'event.options' => RegistrationOptionResource::collection(
                self::event($model)->registrationOptions()->orderBy('sort_order')->orderBy('id')->get()
            )->toArray(self::bare()),

            'member' => (new MemberResource($model->load(['roles', 'section'])))->toArray(self::bare()),

            'registration' => (new RegistrationResource($model->load('choices.option')))->toArray(self::bare()),

            'contact_message' => (new ContactMessageResource($model->load('handledBy')))->toArray(self::bare()),
            'history' => (new HistoryEntryResource($model))->toArray(self::bare()),
            'image' => (new ImageResource($model))->toArray(self::bare()),
            // Without the count, which other events change: renaming one
            // tag must not 412 because somebody tagged an event meanwhile.
            'event_tag' => array_diff_key(
                (new EventTagResource($model))->toArray(self::bare()),
                ['eventCount' => true],
            ),
            // With the holders, unlike a tag's count. A delete takes the role
            // from everybody its confirmation named, so somebody given the
            // role since the read must refuse it; a rename refused for the
            // same reason is the cheaper mistake.
            'role' => (new RoleResource($model->load('members')))->toArray(self::bare()),
            // Without the counts, which the roster changes: renaming a
            // register must not 412 because somebody joined it meanwhile.
            // The delete refuses on members by itself.
            'section' => (new SectionResource($model))->toArray(self::bare()),

            default => throw new InvalidArgumentException("No state is defined for the facet `{$facet}`."),
        };
    }

    /** Narrows the bound model for the one arm above that needs a relation off it. */
    private static function event(Model $model): Event
    {
        if (! $model instanceof Event) {
            throw new InvalidArgumentException('The event.options facet was read from a '.$model::class.'.');
        }

        return $model;
    }
}

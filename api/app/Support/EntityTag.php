<?php

namespace App\Support;

use App\Http\Resources\EventResource;
use App\Http\Resources\MemberResource;
use App\Http\Resources\RegistrationOptionResource;
use App\Http\Resources\RegistrationResource;
use App\Models\Event;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use InvalidArgumentException;

/**
 * The entity tag a conditional write is checked against.
 *
 * RFC 9110 §8.8.3. A strong validator over one thing's STATE, handed out by
 * the read that renders it and quoted back by the write that changes it, so a
 * write can be refused when the state moved underneath the client. See
 * App\Http\Middleware\ConditionalWrite.
 *
 * DERIVED FROM THE RESOURCE, NOT FROM THE COLUMNS, and that is the whole point
 * of the design. A hand-written list of the fields that count is a list
 * somebody forgets to extend, and a forgotten field is a change the tag does
 * not move for — which is exactly the lost update this machinery exists to
 * catch. Rendering the same Resource the API renders means a new field is
 * covered the moment it is added, with nothing to remember.
 *
 * It is what the ROSTER's tag needs, too: a member's roles live in a pivot
 * table, so `members.updated_at` does not move when they change. A timestamp
 * validator would let one administrator's role change silently discard
 * another's. MemberResource carries `roleIds`, so this one does not.
 *
 * RENDERED WITHOUT A CALLER, deliberately. EventResource's `myAttendance` is
 * the caller's own answer and nobody else's, so a tag computed from a rendered
 * response body would differ between two committee members looking at the same
 * event — and a member answering an event would invalidate their own pending
 * edit of it. state() below is handed a freshly-read model with no relations on
 * it and loads only the ones that are part of the ENTITY, so `myAttendance`
 * reports the null of an unloaded relation. Pinned by
 * test_an_events_tag_does_not_depend_on_who_is_asking.
 *
 * STRONG, not weak (`W/`). RFC 9110 §13.1.1 compares If-Match with the strong
 * comparison function, so a weak tag is unusable for the single job this has.
 * The representation a GET actually sends does carry `myAttendance`, which
 * makes the tag formally a weak validator of THOSE BYTES — accepted, because
 * every route that hands one out also sends `Cache-Control: no-store`, so no
 * cache exists that could act on it, and this API implements no conditional
 * GET (`If-None-Match`) at all.
 *
 * ALWAYS RE-READ FROM THE DATABASE, because the question is what is STORED and
 * a model in hand may answer something else. Inside the middleware the bound
 * instance happens to agree, which is exactly why the re-read has its own test
 * rather than resting on that: compute() is called from elsewhere too — the
 * test helper, and whatever calls it next — with a model somebody has already
 * touched. Pinned by test_the_tag_describes_what_is_stored_not_what_is_in_hand,
 * which fails within a second of the re-read being removed.
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
     * so a facet added to one and not the other throws rather than tagging the
     * wrong thing — and test_every_facet_can_be_computed walks this list.
     *
     * @var array<string, string>
     */
    private const FACETS = [
        'event' => 'event',
        'event.options' => 'event',
        'member' => 'member',
        'registration' => 'registration',
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

    /**
     * The tag for one facet of whatever this request has bound, or null when
     * the thing is gone — a DELETE's own response, or a row another request
     * removed between the read and the write.
     */
    public static function of(string $facet, Request $request): ?string
    {
        $bound = $request->route(self::FACETS[$facet]);

        return $bound instanceof Model ? self::compute($facet, $bound) : null;
    }

    /**
     * The tag for one facet of a model in hand, or null when the row is gone.
     *
     * Separate from of() so a test can ask for the header a conditional write
     * owes without an HTTP round trip first — see Tests\TestCase::ifMatch().
     * The middleware and the tests then read the tag through the same code,
     * which is the point: a helper that computed it its own way would pass
     * while the API refused.
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
     * request over a few hundred bytes, so the cost is unmeasurable, and a
     * truncation would need an argument about collisions that nobody should
     * have to make about an optimistic-concurrency token.
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
     * the API renders — see the note on the class for why it is not a list of
     * columns.
     *
     * THE DEFAULT ARM THROWS. A facet named in FACETS with nothing here is a
     * mistake that must be loud: falling back to some other facet's state would
     * make every write on that route pass a check it never performed, and
     * report success while enforcing nothing.
     *
     * NOTHING IS LOADED FOR THE EVENT, and that is what keeps `myAttendance` —
     * the caller's own answer — out of its tag. compute() hands this a freshly
     * read model with no relations on it, and EventResource reports null for an
     * unloaded one, so an event's tag is the same for a member who has answered
     * and one who has not. Pinned by
     * test_an_events_tag_does_not_depend_on_who_is_asking; a `load` added here
     * for convenience would break it. The other three load exactly what their
     * Resource publishes and no more: a member's roles because a role change
     * must move the tag, their section because the Resource names it, and a
     * booking's line items because they are what it is.
     *
     * @return array<mixed>
     */
    private static function state(string $facet, Model $model): array
    {
        return match ($facet) {
            'event' => (new EventResource($model))->toArray(self::bare()),

            'event.options' => RegistrationOptionResource::collection(
                self::event($model)->registrationOptions()->orderBy('sort_order')->orderBy('id')->get()
            )->toArray(self::bare()),

            'member' => (new MemberResource($model->load(['roles', 'section'])))->toArray(self::bare()),

            'registration' => (new RegistrationResource($model->load('choices.option')))->toArray(self::bare()),

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

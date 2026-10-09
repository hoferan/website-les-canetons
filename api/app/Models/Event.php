<?php

namespace App\Models;

use App\Casts\UtcDateTime;
use Carbon\CarbonImmutable;
use Database\Factories\EventFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * A rehearsal or gig on the planning. The committee enters it, every member
 * reads it, and every player answers it.
 *
 * `starts_at`/`ends_at` replace the old date + two TIME columns + `weekend`
 * boolean: a multi-day event is one whose start and end fall on different
 * days, so there is no flag to keep in step with them. A draft may lack both
 * and its location; a PUBLISHED event never does, and the publish path is what
 * holds that now (see the add_published_at migration).
 *
 * `published_at` null means draft. It is a separate axis from `is_public`:
 * a draft is seen by nobody but `events.manage`, whatever `is_public` says.
 *
 * The @property tags below say what casts() already does at runtime. Larastan
 * runs at level 5 and cannot read casts(), so without them these read as their
 * raw column types and every caller has to defend against a type that never
 * occurs. Member.php carries the same block for the same reason.
 *
 * @property CarbonImmutable|null $starts_at
 * @property CarbonImmutable|null $ends_at
 * @property string|null $location
 * @property CarbonImmutable|null $published_at
 * @property bool $is_public
 * @property CarbonImmutable|null $registration_opens_at
 * @property CarbonImmutable|null $registration_closes_at
 * @property int|null $registration_max_guests
 */
class Event extends Model
{
    /** @use HasFactory<EventFactory> */
    use HasFactory;

    /**
     * Mirrors the column default. Eloquent's create() only ever inserts
     * attributes it was given — it never reads back a DB-side DEFAULT after
     * the insert — so a caller that omits `is_public` (as
     * App\Http\Controllers will, once one exists) would otherwise see it as
     * null in the same request rather than false. Declaring it here keeps the
     * model's view of a fresh row consistent with what the migration defaults
     * the column to.
     */
    protected $attributes = [
        'is_public' => false,
    ];

    /** What a list eager-loads to render every event's poster. See poster(). */
    public const POSTER = 'poster.image.sizes';

    protected $fillable = [
        'title',
        'starts_at',
        'ends_at',
        'location',
        'attire',
        'is_public',
        'notes',
        'registration_opens_at',
        'registration_closes_at',
        'registration_max_guests',
        'published_at',
    ];

    /**
     * Every answer for this event.
     *
     * GET /api/v1/events loads it CONSTRAINED TO THE CALLER, which is what
     * makes `myAttendance` one extra query for the whole list rather than
     * one per row. The chase list does not use this relation at all — it
     * fetches the answers once and setRelation()s them onto the roster.
     *
     * @return HasMany<Attendance, $this>
     */
    public function attendance(): HasMany
    {
        return $this->hasMany(Attendance::class);
    }

    /**
     * Clears the booking choices before the database cascades run.
     *
     * WHY THIS IS NEEDED, MEASURED 2026-09-10. Deleting an event cascades
     * into BOTH `registrations` and `event_registration_options`, and
     * `registration_choices.option_id` is ON DELETE RESTRICT. MySQL does not
     * order the two cascades, so it can try to remove an option while the
     * choices still point at it, and the whole delete fails with a foreign
     * key violation — which is what
     * RegistrationSchemaTest::test_deleting_the_event_takes_the_whole_booking_tree
     * caught.
     *
     * RESTRICT IS STILL RIGHT and is not the bug. It guards the case that
     * matters: deleting an option somebody has already booked, while the
     * event lives, would silently rewrite what that person ordered. SQL
     * simply cannot express "restrict, unless the parent is going too", so
     * the application says it here — on the model rather than in the
     * controller, so a seeder, an import or a future endpoint cannot forget.
     * The same argument App\Casts\UtcDateTime is on the column for.
     *
     * One extra DELETE, on a path that already writes several, and only for
     * events that have bookings at all.
     */
    protected static function booted(): void
    {
        static::deleting(function (Event $event): void {
            RegistrationChoice::query()
                ->whereIn('registration_id', $event->registrations()->select('id'))
                ->delete();

            // The poster's slot goes too, or its image would stay in use by a
            // slot no page shows any more and the library would refuse to
            // delete it.
            $event->poster()->delete();
        });
    }

    /**
     * The poster (#228): the photo slot `event-{id}`, placed like any other
     * slot through PUT /photo-slots/{slot}.
     *
     * Keyed on posterSlot() rather than a column, so a poster needs no
     * migration, and eager loading still reads every event's poster in one
     * query: Eloquent reads a relation's local key through getAttribute(),
     * which answers for an accessor as it does for a column.
     *
     * @return HasOne<PhotoSlot, $this>
     */
    public function poster(): HasOne
    {
        return $this->hasOne(PhotoSlot::class, 'slot', 'poster_slot');
    }

    /** @return Attribute<string, never> */
    protected function posterSlot(): Attribute
    {
        return Attribute::get(fn (): string => PhotoSlot::forEvent($this->id));
    }

    /**
     * In the committee's tag order, so a card's chips read the same on every
     * event (#107).
     *
     * @return BelongsToMany<EventTag, $this>
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(EventTag::class)->orderBy('sort_order')->orderBy('event_tags.id');
    }

    /** @return HasMany<RegistrationOption, $this> */
    public function registrationOptions(): HasMany
    {
        return $this->hasMany(RegistrationOption::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return HasMany<Registration, $this> */
    public function registrations(): HasMany
    {
        return $this->hasMany(Registration::class);
    }

    /**
     * Every option booked at this event, across every booking.
     *
     * EXISTS SO withSum HAS A RELATION TO NAME. Laravel's aggregate helpers
     * take one relation, not a dotted path, so "sum the quantities of the
     * choices of this event's registrations" needs the hop declared. Nothing
     * reads it as a relation.
     *
     * @return HasManyThrough<RegistrationChoice, Registration, $this>
     */
    public function registrationChoices(): HasManyThrough
    {
        return $this->hasManyThrough(RegistrationChoice::class, Registration::class);
    }

    /** Whether this event has not been published yet. */
    public function isDraft(): bool
    {
        return $this->published_at === null;
    }

    /**
     * Only the events the band can see.
     *
     * @param  Builder<Event>  $query
     * @return Builder<Event>
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query->whereNotNull('published_at');
    }

    /**
     * Whether this event takes public registrations at all.
     *
     * IFF `registration_closes_at IS NOT NULL` (ADR 0020). No separate
     * boolean — a flag beside a date is a flag that drifts out of step with it,
     * which is exactly what the retired `weekend` column did.
     */
    public function takesRegistrations(): bool
    {
        return $this->registration_closes_at !== null;
    }

    /**
     * Whether the form is accepting bookings RIGHT NOW.
     *
     * A missing `registration_opens_at` means open immediately, so the
     * committee can enable an event without also having to decide when the
     * form should appear.
     */
    public function registrationIsOpen(): bool
    {
        if (! $this->takesRegistrations()) {
            return false;
        }

        if ($this->registration_opens_at !== null && $this->registration_opens_at->isFuture()) {
            return false;
        }

        return $this->registration_closes_at->isFuture();
    }

    protected function casts(): array
    {
        return [
            // NOT 'datetime'. That cast keeps an incoming offset and then
            // formats it away, storing a Fribourg wall-clock hour in a column
            // every reader treats as UTC — measured, with numbers, in
            // App\Casts\UtcDateTime's docblock. It sits on the column rather
            // than on the endpoint that happens to write it today, so the
            // next writer is correct without knowing any of this.
            'starts_at' => UtcDateTime::class,
            'ends_at' => UtcDateTime::class,
            // Same cast, same reason. Null is a draft.
            'published_at' => UtcDateTime::class,
            'is_public' => 'boolean',
            // The same cast as the event's own times, and for the same
            // measured reason: a closing date typed as 23:59 in Fribourg
            // must not be stored as 23:59 UTC, or the form shuts an hour
            // early in summer.
            'registration_opens_at' => UtcDateTime::class,
            'registration_closes_at' => UtcDateTime::class,
            'registration_max_guests' => 'integer',
        ];
    }
}

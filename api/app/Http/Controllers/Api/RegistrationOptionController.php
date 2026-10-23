<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReplaceRegistrationOptionsRequest;
use App\Http\Resources\RegistrationOptionResource;
use App\Models\Event;
use App\Models\RegistrationOption;
use App\Support\Audit;
use App\Support\Emits;
use App\Support\OptionKind;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

#[Group('Registration', weight: 40)]
class RegistrationOptionController extends Controller
{
    /**
     * Read an event's bookable options.
     *
     * Requires `events.manage`. Returns the options in sort order.
     *
     * Read this before replacing them, and quote the `ETag` it returns in the
     * `If-Match` header of the PUT. The tag covers the option list, not the
     * event: correcting the event's dress code does not invalidate a pending
     * options edit, and adding an option does, which catches a lost update.
     *
     * The public booking form reads the same options from
     * `GET /api/v1/events/{event}/registration`, which needs no session but
     * answers 404 for an event that takes no bookings. This one answers with
     * an empty list instead, because configuring an event that does not take
     * bookings yet is exactly when the committee needs it.
     */
    #[Endpoint(operationId: 'registrationOption.index')]
    public function index(Event $event): AnonymousResourceCollection
    {
        return RegistrationOptionResource::collection(
            $event->registrationOptions()->withSum('choices', 'quantity')->get()
        );
    }

    /**
     * Replace an event's bookable options.
     *
     * Requires `events.manage`, because configuring what an event offers is
     * configuring the event.
     *
     * Send the complete list. An entry carrying an `id` updates that option,
     * an entry without one creates it, and an option missing from the list
     * is deleted. Replaying the same body converges on the same list, so a
     * retry after a timeout is safe.
     *
     * `priceCents` is a whole number of centimes and may be null, for an
     * option that is free or whose price lives in its description.
     * `capacity` caps how many of an option can be booked in all, and null
     * or omitted is no limit. Each option comes back with `remaining`, the
     * places still free. `sortOrder` may be left out, in which case the entry's position in the
     * list is used.
     *
     * Returns the event's options as they now stand, in sort order.
     *
     * Removing an option somebody has already booked answers
     * `409 option_has_registrations`, names the options in the way, and
     * changes nothing. An `id` belonging to another event's option, more
     * than 50 entries, or a missing label answers `400 validation_failed`.
     *
     * Each entry is one block of the form, by `kind`. A block somebody has
     * answered keeps its kind and its `countsGuests`
     * (`409 option_shape_locked`), and a choice keeps every answer somebody
     * picked (`409 choice_answer_in_use`); its wording may change.
     */
    #[Endpoint(operationId: 'registrationOption.replace')]
    #[Emits('option_has_registrations', 'option_shape_locked', 'choice_answer_in_use')]
    public function replace(ReplaceRegistrationOptionsRequest $request, Event $event): JsonResponse
    {
        // A whole-list PUT: the committee fills in one form listing every
        // option, and an "add one" API cannot express removal.
        //
        // Gated on `events.manage`, since configuring what an event offers is
        // configuring the event. `registrations.view` and
        // `registrations.manage` are about the people who booked.

        /** @var list<array<string, mixed>> $incoming */
        $incoming = $request->validated()['options'];

        $existing = $event->registrationOptions()->get()->keyBy('id');
        $targets = self::targets($incoming, $existing);

        // Checked before anything is written. The RESTRICT foreign key would
        // refuse the delete anyway, but with a 500 halfway through the
        // transaction; refusing here can name the option in use.
        //
        // An option survives if the request names its id, or if an id-less
        // entry adopts it (see targets()). Checking only ids would refuse a
        // plain retry of the first save.
        $booked = $existing
            ->except(array_filter($targets))
            ->filter(fn (RegistrationOption $option) => $option->isBooked());

        if ($booked->isNotEmpty()) {
            return ApiError::json(
                409,
                'option_has_registrations',
                'An option cannot be removed while people have booked it: '
                    .$booked->pluck('label')->implode(', '),
            );
        }

        $rows = [];

        foreach ($incoming as $index => $option) {
            $target = $targets[$index] === null ? null : $existing->get($targets[$index]);
            $kind = OptionKind::from($option['kind']);
            $countsGuests = $kind === OptionKind::Quantity && ($option['countsGuests'] ?? true);
            $answers = $kind === OptionKind::Choice ? self::keyed($option['answers'], $target) : null;

            // A booking's answer means what the block meant when it was
            // given: "3" read as people, or a free text read as yes/no, would
            // rewrite it. Labels, prices and answers' wording stay editable.
            if ($target !== null && $target->isBooked()) {
                if ($target->kind !== $kind || $target->counts_guests !== $countsGuests) {
                    return ApiError::json(409, 'option_shape_locked',
                        "Somebody has answered \"{$target->label}\", so its kind and whether it counts people stay as they are");
                }

                if ($kind === OptionKind::Choice) {
                    $kept = array_column($answers ?? [], 'id');
                    $lost = $target->choices()->whereNotNull('value')->distinct()->pluck('value')
                        ->reject(fn (string $key) => in_array($key, $kept, true));

                    if ($lost->isNotEmpty()) {
                        return ApiError::json(409, 'choice_answer_in_use',
                            "An answer of \"{$target->label}\" that somebody picked cannot be removed");
                    }
                }
            }

            $rows[] = [$target?->id, [
                'kind' => $kind,
                'label' => $option['label'] ?? null,
                'description' => $option['description'] ?? null,
                'required' => $kind->isInput() && ($option['required'] ?? false),
                'counts_guests' => $countsGuests,
                'price_cents' => $option['priceCents'] ?? null,
                'capacity' => $option['capacity'] ?? null,
                'settings' => $answers === null ? null : ['answers' => $answers],
                // Falls back to the position in the submitted array, so a
                // client need not number the list.
                'sort_order' => $option['sortOrder'] ?? $index,
            ]];
        }

        DB::transaction(function () use ($event, $rows): void {
            $claimed = [];

            foreach ($rows as [$id, $attributes]) {
                if ($id !== null) {
                    // Through the model, not a query update, so the casts
                    // encode `kind` and `settings`. Scoped to this event, so
                    // an id belonging to another event's option cannot be
                    // hijacked into this one.
                    $event->registrationOptions()->findOrFail($id)->update($attributes);
                    $claimed[] = $id;

                    continue;
                }

                $claimed[] = $event->registrationOptions()->create($attributes)->id;
            }

            // Deleted last, against what survived rather than the ids sent,
            // so a row adopted by label is not removed.
            $event->registrationOptions()->whereNotIn('id', $claimed)->delete();
        });

        Audit::record(
            $request->user(),
            'event.registration_options_replaced',
            'event',
            $event->id,
            $event->title,
        );

        return response()->json(
            RegistrationOptionResource::collection($event->registrationOptions()->withSum('choices', 'quantity')->get())
        );
    }

    /**
     * The existing option each incoming entry updates, by position, or null
     * for one it creates.
     *
     * An entry with an id updates that option. One without adopts an unclaimed
     * option of the same kind and label. That keeps the write idempotent:
     * replaying the committee's first save (no ids yet, e.g. a retry after a
     * timeout) would otherwise delete what the first call created and
     * re-create it under new ids, and a booking in between would make the
     * retry answer option_has_registrations. A paragraph without a label is
     * never adopted; recreating it is harmless, since nobody answers one.
     *
     * @param  list<array<string, mixed>>  $incoming
     * @param  Collection<int, RegistrationOption>  $existing
     * @return list<int|null>
     */
    private static function targets(array $incoming, Collection $existing): array
    {
        $named = collect($incoming)->pluck('id')->filter()->map(fn ($id) => (int) $id)->all();
        $adoptable = $existing->except($named);

        $targets = [];

        foreach ($incoming as $option) {
            if (($option['id'] ?? null) !== null) {
                $targets[] = (int) $option['id'];

                continue;
            }

            $label = $option['label'] ?? null;
            $match = $label === null ? null : $adoptable->first(
                fn (RegistrationOption $candidate) => $candidate->label === $label
                    && $candidate->kind->value === $option['kind']
            );

            if ($match !== null) {
                $adoptable->forget($match->id);
            }

            $targets[] = $match?->id;
        }

        return $targets;
    }

    /**
     * A choice's answers with their ids settled.
     *
     * An id the option already has is kept. An answer sent without one takes
     * the id of the existing answer with the same label, for the same reason
     * targets() adopts by label; anything else gets a fresh id. An id the
     * option does not have is treated as absent rather than trusted, so a
     * client cannot point an answer at another block's id.
     *
     * @param  list<array{id?: string|null, label: string}>  $sent
     * @return list<array{id: string, label: string}>
     */
    private static function keyed(array $sent, ?RegistrationOption $target): array
    {
        $known = collect($target?->answers() ?? []);
        $taken = [];
        $answers = [];

        foreach ($sent as $answer) {
            $key = $answer['id'] ?? null;

            if ($key === null || ! $known->contains('id', $key) || in_array($key, $taken, true)) {
                $key = $known->first(fn (array $old) => $old['label'] === $answer['label']
                    && ! in_array($old['id'], $taken, true))['id'] ?? null;
            }

            $key ??= Str::lower(Str::random(8));
            $taken[] = $key;
            $answers[] = ['id' => $key, 'label' => $answer['label']];
        }

        return $answers;
    }
}

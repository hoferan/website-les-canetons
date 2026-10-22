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
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

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
     */
    #[Endpoint(operationId: 'registrationOption.replace')]
    #[Emits('option_has_registrations')]
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

        $keptIds = collect($incoming)
            ->pluck('id')
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->all();

        // Checked before anything is written. The RESTRICT foreign key would
        // refuse the delete anyway, but with a 500 halfway through the
        // transaction; refusing here can name the option in use.
        //
        // An option survives if the request names its id, or if an id-less
        // entry carries its label (the adoption the write below performs).
        // Checking only ids would refuse a plain retry of the first save.
        $incomingLabels = array_column($incoming, 'label');

        $booked = $event->registrationOptions()
            ->whereNotIn('id', $keptIds)
            ->get()
            ->reject(fn (RegistrationOption $option) => in_array($option->label, $incomingLabels, true))
            ->filter(fn (RegistrationOption $option) => $option->isBooked());

        if ($booked->isNotEmpty()) {
            return ApiError::json(
                409,
                'option_has_registrations',
                'An option cannot be removed while people have booked it: '
                    .$booked->pluck('label')->implode(', '),
            );
        }

        DB::transaction(function () use ($event, $incoming, $keptIds): void {
            // The label match keeps this idempotent. Without it, replaying
            // the committee's first save (no ids yet, e.g. a retry after a
            // timeout) would delete what the first call created and re-create
            // it under new ids, and a booking in between would make the retry
            // answer option_has_registrations. Matching an id-less entry to an
            // existing option with the same label lets the second identical
            // request update the row the first one created.
            $existingByLabel = $event->registrationOptions()
                ->whereNotIn('id', $keptIds)
                ->get()
                ->keyBy('label');

            $claimed = [];

            foreach ($incoming as $index => $option) {
                $attributes = [
                    'label' => $option['label'],
                    'description' => $option['description'] ?? null,
                    'price_cents' => $option['priceCents'] ?? null,
                    'capacity' => $option['capacity'] ?? null,
                    // Falls back to the position in the submitted array, so a
                    // client need not number the list.
                    'sort_order' => $option['sortOrder'] ?? $index,
                ];

                $id = $option['id'] ?? null;

                if ($id === null) {
                    $id = $existingByLabel->get($option['label'])?->id;
                }

                if ($id !== null) {
                    // Scoped to this event, so an id belonging to another
                    // event's option cannot be hijacked into this one.
                    $event->registrationOptions()->whereKey($id)->update($attributes);
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
}

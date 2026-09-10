<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\ReplaceRegistrationOptionsRequest;
use App\Http\Resources\RegistrationOptionResource;
use App\Models\Event;
use App\Models\RegistrationOption;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * An event's bookable options, edited as a complete set.
 *
 * Single-action and PUT, matching MemberRoleController: the committee fills
 * in one form listing every option, and an "add one" API cannot express
 * removal.
 *
 * GATED ON `events.manage`, NOT on a registration permission. Configuring
 * what an event offers is configuring the event — the same act as setting
 * its date and its dress code. `registrations.view` and
 * `registrations.manage` are about the people who booked.
 */
class RegistrationOptionController extends Controller
{
    public function __invoke(ReplaceRegistrationOptionsRequest $request, Event $event): JsonResponse
    {
        /** @var list<array<string, mixed>> $incoming */
        $incoming = $request->validated()['options'];

        $keptIds = collect($incoming)
            ->pluck('id')
            ->filter(fn ($id) => $id !== null)
            ->map(fn ($id) => (int) $id)
            ->all();

        // CHECKED BEFORE ANYTHING IS WRITTEN. The foreign key is RESTRICT so
        // the database would refuse the delete anyway, but it would do so
        // with a 500 halfway through the transaction. Refusing here is what
        // lets the committee be told WHICH option is in use, before their
        // other edits are lost.
        // An option survives if the request names its id, OR if an entry
        // with no id carries its label — the same adoption the write below
        // performs. Checking only the ids would refuse a plain retry of the
        // first save, which is exactly the request the adoption exists for.
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
            // IDEMPOTENT, and getting there takes the label match below.
            //
            // The obvious version — delete what is missing, update what has
            // an id, create the rest — is NOT idempotent for the request
            // that matters most: the committee's FIRST save, where no entry
            // has an id yet. Replaying it (a retry after a timeout, on a
            // host these deploy notes call flaky) deletes what the first
            // call created and re-creates it under new ids. If a booking
            // landed in between, the retry then answers
            // option_has_registrations and the whole edit is lost.
            //
            // Matching an id-less entry against an existing option with the
            // same label makes the operation converge: the second identical
            // request updates the row the first one created, and PUT means
            // what it says.
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
                    // Falls back to the position in the submitted array, so
                    // a client that sends the list in order gets the order
                    // it sent without having to number it.
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

            // Deleted LAST, and against what survived rather than against
            // the ids the client sent, so a row adopted by label above is
            // not then removed for having been absent from the request.
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
            RegistrationOptionResource::collection($event->registrationOptions()->get())
        );
    }
}

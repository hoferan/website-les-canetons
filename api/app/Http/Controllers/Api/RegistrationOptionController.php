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
        $booked = $event->registrationOptions()
            ->whereNotIn('id', $keptIds)
            ->get()
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
            $event->registrationOptions()->whereNotIn('id', $keptIds)->delete();

            foreach ($incoming as $index => $option) {
                $attributes = [
                    'label' => $option['label'],
                    'description' => $option['description'] ?? null,
                    'price_cents' => $option['priceCents'] ?? null,
                    // Falls back to the position in the submitted array, so
                    // a client that simply sends the list in order gets the
                    // order it sent without having to number it.
                    'sort_order' => $option['sortOrder'] ?? $index,
                ];

                if (($option['id'] ?? null) !== null) {
                    // Scoped to this event, so an id belonging to another
                    // event's option cannot be hijacked into this one.
                    $event->registrationOptions()
                        ->whereKey($option['id'])
                        ->update($attributes);

                    continue;
                }

                $event->registrationOptions()->create($attributes);
            }
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

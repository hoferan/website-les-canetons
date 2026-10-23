<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\ApiError;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRegistrationRequest;
use App\Http\Requests\UpdateRegistrationRequest;
use App\Http\Resources\RegistrationFormResource;
use App\Http\Resources\RegistrationResource;
use App\Mail\RegistrationConfirmation;
use App\Models\Event;
use App\Models\Registration;
use App\Models\RegistrationChoice;
use App\Models\RegistrationOption;
use App\Support\Audit;
use App\Support\Emits;
use App\Support\OptionKind;
use Dedoc\Scramble\Attributes\Group;
use Dedoc\Scramble\Attributes\IgnoreResponse;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

#[Group('Registration', 'Public bookings for an event that takes them, and the guest list the committee works from.', weight: 40)]
class RegistrationController extends Controller
{
    /**
     * Read a booking form.
     *
     * Anonymous. Returns what a public form needs: the event's title, dates
     * and location, the options that can be booked, the maximum number of
     * people one booking may cover, and whether the form is open right now.
     *
     * `open` is computed by the server. Do not derive it from `opensAt` and
     * `closesAt` on the client, whose clock may be wrong.
     *
     * An event that takes no registrations, or whose form the committee has
     * not opened, answers `404`, whether or not it exists. An open form
     * outside its window answers `200` with `open: false`, so the form can say
     * when bookings start or that they have closed.
     *
     * `asksAddress` and `asksTable` say whether to show those two fields.
     */
    public function form(Event $event): RegistrationFormResource
    {
        // 404 rather than 403: whether an event exists without taking
        // bookings is private planning, and this endpoint needs no session.
        if (! $event->acceptsBookings()) {
            abort(404);
        }

        return new RegistrationFormResource($event->load([
            'registrationOptions' => fn ($options) => $options->withSum('choices', 'quantity'),
        ]));
    }

    /**
     * Book a place at an event.
     *
     * Anonymous, and protected against automated submission: send the
     * `X-Form-Token` header from `GET /api/v1/form-token` and a `website` field
     * that is present and empty, or the request answers
     * `422 spam_suspected`. Rate limited to 10 a minute per IP.
     *
     * Returns the booking with its line items, the number of people it
     * covers and what it comes to in centimes. A confirmation email is sent
     * to the address given; a mail failure does not fail the booking.
     *
     * Refuses with `registration_not_open` before the window opens and
     * `registration_closed` after it shuts, both `409`. A booking larger
     * than the event's per-booking cap fails validation against `choices`
     * with `too_many_guests`. Options must belong to this event, and each
     * may appear at most once.
     *
     * An option with a `capacity` takes no more than its `remaining` places.
     * Asking for more fails validation against `choices.N.quantity` with
     * `not_enough_places`, and nothing is booked. Read the form again for
     * the places now left.
     */
    // Scramble cannot see through `response()->json(new Resource(...), 201)`
    // and would infer an untyped 200, so #[Response] names the 201 body.
    // #[Response] adds a status rather than replacing the inferred one, so
    // #[IgnoreResponse(200)] drops the 200 the client would otherwise expect.
    #[IgnoreResponse(200)]
    #[Response(201, 'The booking, as it was recorded.', type: RegistrationResource::class)]
    #[Emits('registration_not_open', 'registration_closed')]
    public function store(StoreRegistrationRequest $request, Event $event): JsonResponse
    {
        // The acceptsBookings() 404 lives in the Form Request's
        // prepareForValidation(): it has to run before validation, or the
        // caller gets a 400 about option ids instead.
        $refusal = self::refuseUnlessOpen($event);
        if ($refusal !== null) {
            return $refusal;
        }

        $data = $request->validated();

        // Read before the transaction opens, never inside it: see
        // refuseBeyondCapacity() for why the lock has to come first.
        $capped = $event->registrationOptions()
            ->whereIn('id', array_column($data['choices'], 'optionId'))
            ->whereNotNull('capacity')
            ->exists();

        // Also before the transaction, for the same reason as $capped.
        $kinds = $event->registrationOptions()->get()->mapWithKeys(
            fn (RegistrationOption $option): array => [$option->id => $option->kind]
        );

        $registration = DB::transaction(function () use ($data, $event, $capped, $kinds): Registration {
            if ($capped) {
                self::refuseBeyondCapacity($event, $data['choices']);
            }

            $registration = Registration::create([
                'event_id' => $event->id,
                'first_name' => $data['firstName'],
                'last_name' => $data['lastName'],
                'email' => $data['email'],
                'phone' => $data['phone'],
                // A form that does not ask for them stores neither, whatever
                // a hand-written body sends.
                'address' => $event->registration_asks_address ? ($data['address'] ?? null) : null,
                'table_name' => $event->registration_asks_table ? ($data['tableName'] ?? null) : null,
            ]);

            foreach ($data['choices'] as $choice) {
                // Each kind keeps only its own column, whatever else the
                // entry carried.
                $quantity = $kinds[$choice['optionId']] === OptionKind::Quantity;
                $value = $quantity ? null : trim((string) ($choice['value'] ?? ''));

                // A blank text is no answer: the request let it through as
                // such, and an empty row would read as answered.
                if ($value === '') {
                    continue;
                }

                RegistrationChoice::create([
                    'registration_id' => $registration->id,
                    'option_id' => $choice['optionId'],
                    'quantity' => $quantity ? $choice['quantity'] : null,
                    'value' => $value,
                ]);
            }

            return $registration;
        });

        $registration->load('choices.option');

        self::confirm($registration, $event);

        return response()->json(new RegistrationResource($registration), 201);
    }

    /**
     * List everyone booked for an event.
     *
     * Requires `registrations.view`. Returns every booking oldest first,
     * each with its line items, the number of people it covers and its
     * total in centimes.
     *
     * This contains personal data supplied by members of the public. The
     * same list is available as a file from
     * `GET /api/v1/events/{event}/registrations.{format}`.
     */
    public function index(Event $event): AnonymousResourceCollection
    {
        // Two queries whatever the guest count, not one per booking: a
        // souper is ~100 bookings and this is also what the exports read.
        $bookings = $event->registrations()->with('choices.option')->orderBy('created_at')->get();

        return RegistrationResource::collection($bookings);
    }

    /**
     * Read one booking.
     *
     * Requires `registrations.manage`. The same fields the guest list
     * carries, for a single booking.
     *
     * Read this before amending or cancelling one, and quote the `ETag` it
     * returns in the `If-Match` header of the write. The guest list hands out
     * no tag, since one tag cannot validate a hundred bookings.
     */
    public function show(Registration $registration): RegistrationResource
    {
        return new RegistrationResource($registration->load('choices.option'));
    }

    /**
     * Correct a booking's details, or record that it has been paid.
     *
     * Requires `registrations.manage`. Guests cannot amend their own
     * booking, so this is how a misspelled name, a wrong number or a
     * seating change is fixed.
     *
     * Send only the fields that change. An explicit `null` clears an
     * optional field; an omitted field is left alone.
     *
     * `{"paid": true}` records the payment and `paidAt` says when. Sending it
     * again keeps the first time. `{"paid": false}` clears it.
     *
     * What was ordered cannot be changed here. Cancel the booking and make
     * a new one instead.
     */
    public function update(UpdateRegistrationRequest $request, Registration $registration): RegistrationResource
    {
        // The choices are not editable: changing an order would need the
        // per-booking cap re-checked and arguably the confirmation re-sent.
        //
        // array_key_exists, not isset, which is false for an explicit null,
        // so clearing an address would silently do nothing.
        $data = $request->validated();

        $columns = [
            'firstName' => 'first_name',
            'lastName' => 'last_name',
            'email' => 'email',
            'phone' => 'phone',
            'address' => 'address',
            'tableName' => 'table_name',
        ];

        foreach ($columns as $field => $column) {
            if (array_key_exists($field, $data)) {
                $registration->{$column} = $data[$field];
            }
        }

        // The stamp is when the money came in, so a second `true` keeps the
        // first one: the screen may re-send it, and a treasurer reconciling
        // the till wants the time the money was taken.
        if (array_key_exists('paid', $data)) {
            $registration->paid_at = $data['paid']
                ? ($registration->paid_at ?? now())
                : null;
        }

        $registration->save();

        Audit::record(
            $request->user(),
            'registration.updated',
            'registration',
            $registration->id,
            $registration->fullName(),
        );

        return new RegistrationResource($registration->load('choices.option'));
    }

    /**
     * Cancel a booking.
     *
     * Requires `registrations.manage`. Removes the booking and everything
     * it ordered. The guest is not notified.
     *
     * Answers `{"ok": true}`.
     */
    #[Response(200, 'Cancelled. The booking and its line items are gone.')]
    public function destroy(Request $request, Registration $registration): JsonResponse
    {
        // Captured before the delete: the row is gone by the time anybody
        // reads the audit back. See App\Support\Audit.
        $label = $registration->fullName();
        $id = $registration->id;

        DB::transaction(function () use ($registration): void {
            // Explicit even though registration_choices cascades, so the two
            // tables stay consistent if a migration ever relaxes that.
            $registration->choices()->delete();
            $registration->delete();
        });

        Audit::record($request->user(), 'registration.deleted', 'registration', $id, $label);

        return response()->json(['ok' => true]);
    }

    /**
     * Refuses a booking that asks for more of an option than is left.
     *
     * The count and the insert after it have to be one step, or two guests
     * reading the last place both get it. So this locks the event's row and
     * a second booking for the same event waits here until the first commits
     * (ADR 0031). Called only when a requested option has a capacity: an
     * event without one keeps the lock-free path ADR 0020 chose.
     *
     * It must be the transaction's first statement. InnoDB's REPEATABLE READ
     * fixes a transaction's snapshot at its first plain read, so any read
     * before the lock would make the count below miss a booking committed
     * while this one waited.
     *
     * Each refusal is reported against `choices.N.quantity`, N being the
     * position in what was sent, so the form can mark the option that ran
     * out. Throwing rolls the transaction back.
     *
     * @param  list<array{optionId: int, quantity?: int|null, value?: string|null}>  $choices
     */
    private static function refuseBeyondCapacity(Event $event, array $choices): void
    {
        Event::query()->whereKey($event->id)->lockForUpdate()->first();

        $options = $event->registrationOptions()
            ->whereIn('id', array_column($choices, 'optionId'))
            ->withSum('choices', 'quantity')
            ->get()
            ->keyBy('id');

        // A validator of its own rather than withMessages(), because
        // ApiErrorVocabularyTest finds reasons by scanning for errors()->add().
        $validator = Validator::make([], []);

        foreach ($choices as $index => $choice) {
            $remaining = $options->get($choice['optionId'])?->remaining();

            if ($remaining !== null && ($choice['quantity'] ?? 0) > $remaining) {
                $validator->errors()->add("choices.{$index}.quantity", 'not_enough_places');
            }
        }

        if ($validator->errors()->isNotEmpty()) {
            throw new ValidationException($validator);
        }
    }

    /** Refuses a booking outside the window, naming which end was missed. */
    private static function refuseUnlessOpen(Event $event): ?JsonResponse
    {
        if ($event->registrationIsOpen()) {
            return null;
        }

        // Two codes: "come back on the 3rd" and "you have missed it" send the
        // reader to different places.
        if ($event->registration_opens_at !== null && $event->registration_opens_at->isFuture()) {
            return ApiError::json(409, 'registration_not_open', 'Registration has not opened yet');
        }

        return ApiError::json(409, 'registration_closed', 'Registration has closed');
    }

    /**
     * Sends the confirmation, and never lets it fail the booking.
     *
     * Best-effort (ADR 0009). The host can run no queue worker, so the mail
     * goes inline, and an SMTP failure must not throw away a booking that is
     * already stored.
     *
     * Logged rather than swallowed, so a server whose mail is broken says
     * so somewhere.
     */
    private static function confirm(Registration $registration, Event $event): void
    {
        try {
            Mail::to($registration->email)->send(new RegistrationConfirmation($registration, $event));
        } catch (\Throwable $e) {
            // Error, not warning: .env.example sets LOG_LEVEL=error, so a
            // warning would never be written on any server.
            Log::error('Registration confirmation mail failed', [
                'registration_id' => $registration->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

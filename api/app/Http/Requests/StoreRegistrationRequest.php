<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesBookingAnswers;
use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;

/**
 * An anonymous booking for one event.
 *
 * Anonymous, so it also has to satisfy the public write guard: send the
 * `X-Form-Token` header from `GET /api/v1/form-token` and a `website` field that
 * is present and empty, or the request answers `422 spam_suspected`.
 *
 * Name, email and phone are required, because a Swiss committee reaches
 * somebody by telephone the evening before. Address and table name are
 * optional.
 *
 * `choices` holds the answers, one per block of the form: `{optionId,
 * quantity}` for a quantity, `{optionId, value}` for the other kinds, at most
 * 20 entries, each block at most once and belonging to this event. Read the
 * blocks from `GET /api/v1/events/{event}/registration`. A required block left
 * out fails against `answers.<optionId>` with `required`; a value its block
 * does not take fails with `not_an_answer`.
 *
 * The quantities that count people are the booking's size. When the form has
 * any, they must add up to at least one (`no_guests`) and, under a per-booking
 * guest cap, to no more than it (`too_many_guests`), both against `choices`.
 *
 * An event that takes no bookings, whose form is not open, or whose form is for members only, answers `404`, whether or not it exists.
 */
class StoreRegistrationRequest extends FormRequest
{
    use ValidatesBookingAnswers;

    /**
     * The 404 has to happen before validation. In the controller it would
     * come after a 400 about `choices.0.optionId` (the option does not belong
     * to that event), which tells an anonymous caller that the event exists
     * and lets option ids be probed.
     *
     * RegistrationController::form() keeps its own copy of this check
     * because a GET has no Form Request to put it in.
     */
    protected function prepareForValidation(): void
    {
        $event = $this->route('event');

        // A members form too, session or not: members book through
        // /my-registration, with their account and without contact details.
        if ($event instanceof Event && (! $event->acceptsBookings() || $event->isMembersOnly())) {
            abort(404);
        }
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // One of the API's two anonymous writes (the contact form is the
        // other), behind PublicWriteGuard.
        //
        // Name, email and phone are required, since the committee phones the
        // evening before; every further required field is a reason to abandon
        // the form.
        //
        // ApiError reports only the first failed rule per field, so `required`
        // leads each list.
        //
        // The answers come from ValidatesBookingAnswers, shared with a
        // member's booking; the guest cap is checked in its after() closure,
        // because it compares the whole choices array with a number stored on
        // the event.
        return [
            'firstName' => ['required', 'string', 'max:255'],
            'lastName' => ['required', 'string', 'max:255'],
            /** Where the confirmation is sent. A mail failure does not fail the booking. */
            'email' => ['required', 'string', 'email', 'max:255'],
            /** A telephone number, in whatever form the guest writes it. Required: this is how the committee reaches them the evening before. */
            'phone' => ['required', 'string', 'max:64'],
            'address' => ['nullable', 'string', 'max:255'],
            /** Who the guest would like to sit with, as free text. Nothing enforces it; the committee reads it when seating the room. */
            'tableName' => ['nullable', 'string', 'max:255'],

            ...$this->choiceRules(),
        ];
    }

    /** The answers, checked against the event's blocks: see ValidatesBookingAnswers. */
    public function after(): array
    {
        return [$this->answersCheck()];
    }
}

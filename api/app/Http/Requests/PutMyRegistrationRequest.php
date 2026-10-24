<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\ValidatesBookingAnswers;
use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A member's own booking on a form for members only (ADR 0034).
 *
 * Only the answers: the name comes from the account, and no email, phone,
 * address or table is asked. `choices` follows the same rules as a guest's
 * booking: `{optionId, quantity}` for a quantity, `{optionId, value}` for the
 * other kinds, at most 20 entries, each block at most once. A required block
 * left out fails against `answers.<optionId>` with `required`; a value its
 * block does not take fails with `not_an_answer`. The quantities that count
 * people must add up to at least one (`no_guests`) and to no more than the
 * per-booking cap (`too_many_guests`), both against `choices`.
 *
 * An event whose form is not open, or not for members, answers `404`.
 */
class PutMyRegistrationRequest extends FormRequest
{
    use ValidatesBookingAnswers;

    /**
     * Before validation, as for a guest's booking: a 400 about option ids
     * would say the form exists.
     */
    protected function prepareForValidation(): void
    {
        $event = $this->route('event');

        if ($event instanceof Event && ! self::takesMemberBookings($event)) {
            abort(404);
        }
    }

    /** Whether a member may book this event's form with their account. */
    public static function takesMemberBookings(Event $event): bool
    {
        return $event->acceptsBookings() && $event->isMembersOnly();
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return $this->choiceRules();
    }

    /** The answers, checked against the event's blocks: see ValidatesBookingAnswers. */
    public function after(): array
    {
        return [$this->answersCheck()];
    }
}

<?php

namespace App\Http\Requests;

use App\Models\Event;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Marking an event's guest list read, up to the change the screen showed.
 *
 * `upTo` is the cursor rather than "now", so a booking that lands while
 * somebody reads stays unread for everyone (ADR 0035). It has to be one of
 * this event's own journal entries.
 */
class MarkBookingsReadRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        /** @var Event $event */
        $event = $this->route('event');

        return [
            /** `latestChangeId` from the read this screen opened with. */
            'upTo' => [
                'required',
                'integer',
                Rule::exists('booking_changes', 'id')->where('event_id', $event->id),
            ],
        ];
    }

    public function upTo(): int
    {
        return (int) $this->validated('upTo');
    }
}

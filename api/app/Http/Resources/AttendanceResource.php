<?php

namespace App\Http\Resources;

use App\Models\Attendance;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One answer: what they said, why, and whether they said it themselves.
 *
 * The same shape wherever an answer appears — embedded as `myAttendance` on
 * an event, and as the `attendance` of a chase-list entry — so the SPA has
 * one thing to render and one type to narrow.
 *
 * @mixin Attendance
 */
class AttendanceResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** Whether the member is coming. One of `yes` or `no`. */
            'status' => $this->status->value,
            /** Free text the member or the committee added. Required when a member changes their own answer from `yes` to `no`. */
            'note' => $this->note,
            /** True when the committee entered this answer for the member rather than the member answering themselves. */
            'recordedByDirection' => $this->wasRecordedByDirection(),
            /** When the answer was last written. A member may withdraw their own answer entirely for five minutes after this. */
            'recordedAt' => $this->recordedAt(),
        ];
    }

    /**
     * When this answer was last written, so a client can tell whether the
     * five-minute undo window (C12) is still open.
     *
     * Without it the only way to find out is to fire the DELETE and render
     * a 409 answer_already_settled as a surprise, which means the planning
     * cannot honestly decide whether to offer undo at all after the toast
     * has gone.
     *
     * A typed private method for the reason every Resource here has one:
     * Scramble types an inline ->toIso8601String() as an untyped object.
     */
    private function recordedAt(): string
    {
        return $this->updated_at->utc()->toIso8601String();
    }

    /**
     * ALWAYS 200, never 201.
     *
     * MEASURED 2026-09-10: Laravel's ResourceResponse::calculateStatus()
     * answers 201 whenever the underlying model `wasRecentlyCreated`, so an
     * upsert would return 201 for a member's first answer and 200 for every
     * change after it. That is a true statement about the row and a useless
     * one about the request: PUT here is idempotent, the caller performed the
     * same operation either way, and the only thing they need back is the
     * answer as it now stands.
     *
     * It also costs the client something real. orval types each response as a
     * discriminated union of every DECLARED status, so leaking 201 would make
     * every caller narrow two branches that carry identical bodies.
     */
    public function withResponse(Request $request, JsonResponse $response): void
    {
        $response->setStatusCode(200);
    }
}

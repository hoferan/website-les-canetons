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
            'status' => $this->status->value,
            'note' => $this->note,
            'recordedByDirection' => $this->wasRecordedByDirection(),
        ];
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

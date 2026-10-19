<?php

namespace App\Http\Resources;

use App\Models\Attendance;
use App\Support\AttendanceStatus;
use App\Support\Iso8601;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One answer: what they said, why, and whether they said it themselves.
 *
 * The same shape wherever an answer appears (embedded as `myAttendance` on
 * an event, and as the `attendance` of a chase-list entry), so the SPA has
 * one type to render.
 *
 * @mixin Attendance
 */
class AttendanceResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            /** Whether the member is coming. */
            'status' => $this->status(),
            /** Free text the member or the committee added. Required when a member changes their own answer from `yes` to `no`. */
            'note' => $this->note,
            /** True when the committee entered this answer for the member rather than the member answering themselves. */
            'recordedByDirection' => $this->wasRecordedByDirection(),
            /** When the answer was last written. A member may withdraw their own answer entirely for five minutes after this. */
            'recordedAt' => $this->recordedAt(),
        ];
    }

    /**
     * Returned as the enum, not its value. The JSON is the same, but `->value`
     * would publish a bare `string` in the OpenAPI document instead of the
     * closed set the request schemas already declare through
     * AttendanceStatus::rule().
     *
     * A typed method because Scramble reads a declared return type and infers
     * much less from an expression in the array literal.
     */
    private function status(): AttendanceStatus
    {
        return $this->status;
    }

    /**
     * When this answer was last written, so a client can tell whether the
     * five-minute undo window is still open without firing the DELETE and
     * getting a 409 answer_already_settled.
     *
     * Typed because Scramble types an inline rendering call as an untyped
     * object.
     */
    private function recordedAt(): Iso8601
    {
        return Iso8601::utc($this->updated_at);
    }

    /**
     * Always 200, never 201.
     *
     * Laravel's ResourceResponse::calculateStatus() answers 201 whenever the
     * model `wasRecentlyCreated`, so the upsert would return 201 for a
     * member's first answer and 200 after that. The PUT is idempotent, and
     * orval types each response as a union of every declared status, so a
     * 201 would make every caller narrow two branches with identical bodies.
     */
    public function withResponse(Request $request, JsonResponse $response): void
    {
        $response->setStatusCode(200);
    }
}

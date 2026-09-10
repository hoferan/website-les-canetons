<?php

namespace Database\Factories;

use App\Models\Attendance;
use App\Models\Event;
use App\Models\Member;
use App\Support\AttendanceStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Attendance>
 */
class AttendanceFactory extends Factory
{
    protected $model = Attendance::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'event_id' => Event::factory(),
            // A player by default: only somebody in a register is answerable,
            // so an attendance row for a member without one is a state the
            // application never creates.
            'member_id' => Member::factory()->inSection('Cloches'),
            'status' => AttendanceStatus::Yes,
            'note' => null,
            'recorded_by_member_id' => null,
        ];
    }

    public function no(): static
    {
        return $this->state(fn (): array => ['status' => AttendanceStatus::No]);
    }

    /** Entered by the direction rather than by the member. */
    public function recordedBy(Member $recorder): static
    {
        return $this->state(fn (): array => ['recorded_by_member_id' => $recorder->id]);
    }
}

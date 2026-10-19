<?php

namespace App\Models;

use App\Support\AttendanceStatus;
use Database\Factories\AttendanceFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One member's answer for one event.
 *
 * The @property tags repeat what casts() does at runtime: Larastan cannot
 * read casts() and would otherwise see the raw column types.
 *
 * @property AttendanceStatus $status
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Attendance extends Model
{
    /** @use HasFactory<AttendanceFactory> */
    use HasFactory;

    /** Laravel would pluralise this to `attendances`; the word is a mass noun. */
    protected $table = 'attendance';

    protected $fillable = [
        'event_id',
        'member_id',
        'status',
        'note',
        'recorded_by_member_id',
    ];

    protected function casts(): array
    {
        return [
            'status' => AttendanceStatus::class,
        ];
    }

    /** @return BelongsTo<Event, $this> */
    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    /** @return BelongsTo<Member, $this> */
    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    /**
     * Who entered it, when that was not the member themselves.
     *
     * @return BelongsTo<Member, $this>
     */
    public function recordedBy(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'recorded_by_member_id');
    }

    /**
     * True when somebody else entered this answer.
     *
     * Read from the column rather than compared against the current user,
     * because the chase list shows it to every reader.
     */
    public function wasRecordedByDirection(): bool
    {
        return $this->recorded_by_member_id !== null;
    }
}

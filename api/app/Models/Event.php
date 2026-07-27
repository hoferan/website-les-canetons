<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Event extends Model
{
    protected $fillable = [
        'date', 'title', 'start_time', 'end_time', 'location', 'attire', 'weekend',
    ];

    public function responses(): HasMany
    {
        return $this->hasMany(Response::class);
    }

    /**
     * The JSON shape the frontend expects. camelCase keys and the integer
     * `weekend` are what planning_repet.js already reads — do not "fix" them
     * to snake_case without changing that file and i18n.js's fields.* keys.
     *
     * `response` is the CALLER'S OWN answer, injected by EventController when a
     * user is authenticated. There is deliberately no way to ask for another
     * user's answer; that absence is what keeps a previously-fixed IDOR closed.
     */
    public function toFrontendShape(?string $ownAnswer = null): array
    {
        return [
            'id' => (int) $this->id,
            'date' => $this->date,
            'title' => $this->title,
            'startTime' => $this->start_time,
            'endTime' => $this->end_time,
            'location' => $this->location,
            'attire' => $this->attire,
            'weekend' => (int) $this->weekend,
            'response' => $ownAnswer ?: null,
        ];
    }
}

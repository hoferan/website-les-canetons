<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * The single definition of the event JSON shape.
 *
 * It lives here, next to the array literal that produces it, and is imported by
 * EventController::index()'s #[Response] attribute — Scramble cannot infer
 * through that method's Collection::map(), so without the attribute the OpenAPI
 * document described GET /api/events as an array of STRING and the generated
 * TypeScript client repeated it, leaving the SPA's main endpoint untyped.
 *
 * One definition, two readers: keep it in step with toFrontendShape() below.
 *
 * @phpstan-type EventShape array{
 *     id: int,
 *     date: string,
 *     title: string,
 *     startTime: string,
 *     endTime: string,
 *     location: string,
 *     attire: string|null,
 *     weekend: int,
 *     response: string|null,
 * }
 */
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
     * `weekend` are what the SPA reads — do not "fix" them to snake_case
     * without changing web/src too, and i18n.js's fields.* keys with it.
     *
     * `response` is the CALLER'S OWN answer, injected by EventController when a
     * user is authenticated. There is deliberately no way to ask for another
     * user's answer; that absence is what keeps a previously-fixed IDOR closed.
     *
     * @return EventShape
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

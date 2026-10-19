<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\PublicEventResource;
use App\Models\Event;
use App\Support\BandTime;
use Dedoc\Scramble\Attributes\Endpoint;
use Dedoc\Scramble\Attributes\Group;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

// No description: BandController holds the group's, and only one controller per
// group may carry one.
#[Group('Public pages', weight: 55)]
class AgendaController extends Controller
{
    /**
     * List what the band is doing next, for a visitor.
     *
     * Anonymous. Returns the upcoming events the committee has marked public,
     * soonest first: the appearances anybody may come and watch.
     *
     * **A rehearsal is not on this list.** `isPublic` is set per event and
     * defaults to off, so the planning stays private and a public appearance
     * is a decision made about that event.
     *
     * Four fields per event, each one a fact already on a poster. Nothing here
     * says who is coming: attendance is the members' business.
     */
    #[Endpoint(operationId: 'agenda.index')]
    public function index(): AnonymousResourceCollection
    {
        // startOfToday(), as in EventController::index(): a concert that began
        // an hour ago is still tonight's concert to somebody on the way there,
        // and dropping it at its start time reads as a cancellation.
        //
        // Assigned first so Scramble does not publish this comment as the 200
        // description.
        $upcoming = Event::query()
            // Both filters: published says whether anybody but the committee
            // may see the event, is_public whether strangers may. A draft
            // marked public appears nowhere.
            ->published()
            ->where('is_public', true)
            ->where('starts_at', '>=', BandTime::startOfToday())
            ->orderBy('starts_at')
            ->with(['tags', Event::POSTER])
            ->get();

        return PublicEventResource::collection($upcoming);
    }
}

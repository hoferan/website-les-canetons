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
     * soonest first — the appearances anybody may come and watch.
     *
     * **A rehearsal is not on this list.** `isPublic` is set per event and
     * defaults to off, so the planning stays private and a public appearance
     * is a decision somebody made about that event rather than the default for
     * everything in the diary.
     *
     * Four fields per event, each one a fact already on a poster. Nothing here
     * says who is coming: attendance is the members' business.
     */
    #[Endpoint(operationId: 'agenda.index')]
    public function index(): AnonymousResourceCollection
    {
        // startOfToday(), not now() — the same split EventController::index()
        // makes and for the same reason: a concert that began an hour ago is
        // still tonight's concert to somebody checking the address on their
        // phone on the way there. Moving it off the page at its start time is
        // how a visitor concludes it was cancelled.
        //
        // The assignment is what keeps this comment out of the published
        // reference: Scramble serves a comment preceding a return as the 200
        // description.
        $upcoming = Event::query()
            ->where('is_public', true)
            ->where('starts_at', '>=', BandTime::startOfToday())
            ->orderBy('starts_at')
            ->get();

        return PublicEventResource::collection($upcoming);
    }
}

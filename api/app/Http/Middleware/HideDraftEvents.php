<?php

namespace App\Http\Middleware;

use App\Http\Resources\EventResource;
use App\Models\Event;
use App\Support\Permission;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * A draft event does not exist for anybody without `events.manage`.
 *
 * `event.published` on a route that takes an `{event}`. The answer is the
 * ordinary 404, the same one an unknown id gets, so a member cannot tell "no
 * such event" from "an event you may not know about yet". A 403 would say the
 * draft exists.
 *
 * `event.published:everyone` is for the two public registration routes, where
 * not even a manager is let through. A logged-in manager still hits those as a
 * visitor, and a booking taken against an event nobody else can see would be
 * a booking nobody could ever be told about.
 *
 * IT RUNS AFTER ROUTE-MODEL BINDING, which is why it reads a bound Event off
 * the route. It needs no query of its own and no permission query either: the
 * caller's permission set is the one EventResource already memoizes on the
 * request.
 *
 * Attendance is the one place a manager passes this and is refused anyway:
 * being allowed to see a draft is not being allowed to answer it, and that
 * refusal is `event_not_published`, raised in the controllers, because it is a
 * conflict with the event's state and not a missing thing.
 */
class HideDraftEvents
{
    public function handle(Request $request, Closure $next, string $who = 'managers'): Response
    {
        $event = $request->route('event');

        if ($event instanceof Event && $event->isDraft() && ! $this->mayKnowAbout($request, $who)) {
            throw new NotFoundHttpException;
        }

        return $next($request);
    }

    private function mayKnowAbout(Request $request, string $who): bool
    {
        if ($who === 'everyone') {
            return false;
        }

        return EventResource::permissionsFor($request)->contains(Permission::EventsManage);
    }
}

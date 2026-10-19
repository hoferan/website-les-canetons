<?php

namespace App\Http\Middleware;

use App\Models\Event;
use App\Support\EffectivePermissions;
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
 * not even a manager is let through: a booking against an event nobody else
 * can see is one nobody could be told about.
 *
 * It runs after route-model binding and reads the bound Event off the route.
 * The permission set comes from EffectivePermissions::ofRequest(), memoized on
 * the request, so it usually costs no query.
 *
 * Attendance is where a manager passes this and is refused anyway: seeing a
 * draft is not answering it. That refusal is `event_not_published`, raised in
 * the controllers, because it is a conflict with the event's state.
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

        return EffectivePermissions::ofRequest($request)->contains(Permission::EventsManage);
    }
}

import type { ReactNode } from "react";

import type { EventResource } from "../api/generated/model";
import { formatEventWhen } from "./formatEventWhen";

/**
 * One event on the planning.
 *
 * CARDS AT EVERY WIDTH, unlike the roster. That is not an oversight of the
 * "no bare tables on phones" rule but the other side of it: an event has five
 * fields that are read one at a time — when, where, what to wear, what to
 * bring — and there is nothing to scan across. A table would earn its keep on
 * a roster of forty-five people and earns nothing here.
 *
 * IT KNOWS NOTHING ABOUT PERMISSIONS. The organiser's edit and delete controls
 * arrive as `actions` and the answer buttons as `answer`, both decided by the
 * screen. A card that checked `can("events.manage")` or `isPlayer` itself would
 * have to be edited for every future control, and would make this component
 * untestable without a session.
 *
 * TWO SLOTS RATHER THAN ONE, because they are read at different moments.
 * `actions` is the committee's housekeeping and sits up beside the title where
 * it stays out of the way; `answer` is what everybody else came for, so it goes
 * at the bottom, full width, under the detail it is an answer to.
 */
export function EventCard({
  event,
  actions,
  answer,
}: {
  event: EventResource;
  actions?: ReactNode;
  answer?: ReactNode;
}) {
  return (
    <article
      data-testid="event-card"
      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-related">
        <div className="min-w-0">
          <h2 data-testid="event-title" className="font-display text-xl text-ink">
            {event.title}
          </h2>

          <p data-testid="event-when" className="mt-tight text-sm text-ink-muted">
            {formatEventWhen(event.startsAt, event.endsAt)}
          </p>
        </div>

        {/* Only rendered when the screen passed some, so a player's card has
            no empty control row taking up space. */}
        {actions ? <div className="flex shrink-0 flex-wrap gap-tight">{actions}</div> : null}
      </div>

      <dl className="mt-related grid gap-tight text-sm">
        <div className="flex gap-tight">
          <dt className="text-ink-muted">Lieu&nbsp;:</dt>
          <dd data-testid="event-location" className="text-ink">
            {event.location}
          </dd>
        </div>

        {/* Attire is nullable — "Vendanges Cheyres" in the real planning has
            none. Saying so beats an empty row that reads as a missing value. */}
        <div className="flex gap-tight">
          <dt className="text-ink-muted">Tenue&nbsp;:</dt>
          <dd data-testid="event-attire" className="text-ink">
            {event.attire ?? "Non précisée"}
          </dd>
        </div>
      </dl>

      {event.notes ? (
        <p data-testid="event-notes" className="mt-related text-sm whitespace-pre-line text-ink">
          {event.notes}
        </p>
      ) : null}

      {answer}
    </article>
  );
}

import type { ReactNode } from "react";

import type { EventResource } from "../api/generated/model";
import { t } from "../i18n";
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
 * THREE SLOTS RATHER THAN ONE, because they are read at different moments.
 * `actions` is the committee's housekeeping and sits up beside the title where
 * it stays out of the way; `answer` is what everybody else came for, so it goes
 * at the bottom, full width, under the detail it is an answer to; `meta` is the
 * committee's read-only summary — visibility and the answer/booking counts —
 * decided by the screen exactly like the other two, and rendered under the
 * date line.
 */
export function EventCard({
  event,
  actions,
  answer,
  meta,
}: {
  event: EventResource;
  actions?: ReactNode;
  answer?: ReactNode;
  meta?: ReactNode;
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

          {/* INSIDE THE min-w-0 COLUMN, not beside it. The strip wraps on its
              own at 390px rather than widening the card — #89's failure was a
              box that could not shrink dragging the document 223px sideways,
              and the action row directly above this one is still open as
              #118. */}
          {meta}
        </div>

        {/* Only rendered when the screen passed some, so a player's card has
            no empty control row taking up space.

            NO `shrink-0` HERE, and that is the fix for #89 rather than a
            tidy-up. It pinned this box at its own unwrapped width — 459px on
            four buttons, 580px on the souper's five — so the `flex-wrap` beside
            it could never fire and the row ran 223px past a 390px phone,
            dragging the whole document with it. Without it the box may shrink
            to its min-content, which for a wrapping flex container is its
            widest single button, and the wrap happens. The buttons keep their
            own `shrink-0` from the base class in components/ui/button.tsx:
            individual buttons should not squash, the ROW should wrap. */}
        {actions ? <div className="flex flex-wrap gap-tight">{actions}</div> : null}
      </div>

      <dl className="mt-related grid gap-tight text-sm">
        <div className="flex gap-tight">
          {/* THE COLON AND ITS NO-BREAK SPACE ARE IN THE STRING. French
              sets a space before a colon and German sets none, so a label
              plus ": " composed here is French typography on a German
              page -- the Tbd bug of #152, exactly. */}
          <dt className="text-ink-muted">{t("events.card.location")}</dt>
          <dd data-testid="event-location" className="text-ink">
            {event.location}
          </dd>
        </div>

        {/* Attire is nullable — "Vendanges Cheyres" in the real planning has
            none. Saying so beats an empty row that reads as a missing value. */}
        <div className="flex gap-tight">
          <dt className="text-ink-muted">{t("events.card.attire")}</dt>
          <dd data-testid="event-attire" className="text-ink">
            {event.attire ?? t("events.card.attireUnset")}
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

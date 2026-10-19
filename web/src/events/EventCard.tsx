import type { ReactNode } from "react";

import type { EventResource } from "../api/generated/model";
import { t } from "../i18n";
import { isDraft } from "./eventDates";
import { EventPoster } from "./EventPoster";
import { formatEventWhen } from "./formatEventWhen";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * One event on the planning.
 *
 * A card at every width: an event's fields are read one at a time (when,
 * where, what to wear, what to bring), with nothing to scan across.
 *
 * It knows nothing about permissions. The screen decides what goes in each
 * slot, so the card needs no session and no edit for a new control.
 *
 * The three slots are read at different moments. `actions` is the committee's
 * housekeeping, beside the title and out of the way. `answer` is what everyone
 * else came for, full width at the bottom, under the detail it answers. `meta`
 * is the committee's read-only summary (visibility, answer and booking
 * counts), under the date line.
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
      // A dashed edge on a draft, so it reads as unfinished even where the
      // group heading is out of view.
      className={`${OUTLINED_CARD} p-4 ${isDraft(event) ? "border-dashed" : ""}`}
    >
      {/* The poster takes the first row on a phone and the right-hand column
          from `md` up, beside everything but the answer, which stays full
          width under the detail it answers. See EventPoster. */}
      <div
        className={event.poster ? "grid gap-related md:grid-cols-[minmax(0,1fr)_auto]" : undefined}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-related">
            <div className="min-w-0">
              <h2 data-testid="event-title" className="font-display text-xl text-ink">
                {event.title}
              </h2>

              {/* The badge states the draft outright. A search or a chosen day can
                  show this card without the group heading in view. */}
              {isDraft(event) ? (
                <div className="mt-tight flex">
                  {/* A flex child like the "Public" chip: as inline-block the
                      badge collapses to 32px and its text runs out of the
                      pill. */}
                  <span
                    data-testid="draft-badge"
                    className="rounded-full border border-line bg-panel px-2 py-0.5 text-sm font-medium text-ink"
                  >
                    {t("events.draftBadge")}
                  </span>
                </div>
              ) : null}

              <p data-testid="event-when" className="mt-tight text-sm text-ink-muted">
                {formatEventWhen(event.startsAt, event.endsAt)}
              </p>

              {/* Inside the min-w-0 column, so the strip wraps at 390px
                  instead of widening the card and the document with it. */}
              {meta}
            </div>

            {/* No `shrink-0` on this box (#89): it would pin the row at its
                unwrapped width, so `flex-wrap` never fires and the row runs
                past a 390px phone. Shrinkable, its min-content is its widest
                button and the row wraps. The buttons keep their own
                `shrink-0` from components/ui/button.tsx, so they do not
                squash. */}
            {actions ? <div className="flex flex-wrap gap-tight">{actions}</div> : null}
          </div>

          <dl className="mt-related grid gap-tight text-sm">
            <div className="flex gap-tight">
              {/* The colon and its no-break space are in the string: French
                  sets a space before a colon and German none, so composing
                  ": " here would put French typography on a German page. */}
              <dt className="text-ink-muted">{t("events.card.location")}</dt>
              <dd data-testid="event-location" className="text-ink">
                {event.location ?? (
                  <span className="text-ink-muted">{t("events.card.locationMissing")}</span>
                )}
              </dd>
            </div>

            {/* Attire is nullable. Saying so beats an empty row that reads as
                a missing value. */}
            <div className="flex gap-tight">
              <dt className="text-ink-muted">{t("events.card.attire")}</dt>
              <dd data-testid="event-attire" className="text-ink">
                {event.attire ?? t("events.card.attireUnset")}
              </dd>
            </div>
          </dl>

          {event.notes ? (
            <p
              data-testid="event-notes"
              className="mt-related text-sm whitespace-pre-line text-ink"
            >
              {event.notes}
            </p>
          ) : null}
        </div>

        {event.poster ? (
          <EventPoster
            poster={event.poster}
            title={event.title}
            className="row-start-1 md:col-start-2"
          />
        ) : null}
      </div>

      {answer}
    </article>
  );
}

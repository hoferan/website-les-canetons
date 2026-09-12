import { rowsOf } from "../api/collection";
import { useAgendaIndex } from "../api/generated/endpoints";
import type { PublicEventResource } from "../api/generated/model";
import { formatEventWhen } from "./formatEventWhen";

/** How many appearances the front page shows before it stops. */
const SHOWN = 3;

/**
 * What the band is doing next, on the front page — or nothing at all.
 *
 * IT RENDERS NOTHING UNLESS IT HAS AN EVENT, AND THAT IS THE WHOLE DESIGN.
 * Pending, refused and empty all collapse into an empty list, so one guard
 * covers all three. There is deliberately no "Chargement…" and no error:
 *
 *   - a card saying "aucun événement" on a band's front page reads as "this
 *     band does nothing", which is worse than no section at all;
 *   - the visitor never asked for the schedule, so an error about it is noise
 *     on the page where noise is most visible;
 *   - this live dependency must never hold up the hero, and a component that
 *     can only add or add nothing cannot.
 *
 * NOT EventCard, which is typed on EventResource and renders the dress code,
 * the committee's notes and an answer slot. This list has four fields, each
 * one already on a poster, and no caller who may see the rest.
 *
 * THREE, NOT ALL OF THEM. The endpoint answers the whole public agenda,
 * because "everything coming up" is the honest shape for it and a second
 * screen will want all of it; the front page is a front page, and a season of
 * carnival dates below the hero is a schedule rather than an invitation.
 */
export function PublicAgenda() {
  const agenda = useAgendaIndex();
  const upcoming = rowsOf<PublicEventResource>(agenda.data).slice(0, SHOWN);

  if (upcoming.length === 0) {
    return null;
  }

  return (
    <section className="mt-block" aria-labelledby="agenda-heading">
      <h2 id="agenda-heading" className="font-display text-2xl">
        Où nous voir
      </h2>

      <ul className="mt-related grid gap-3">
        {upcoming.map((event) => (
          // Keyed on the start and the title together. The public resource
          // carries no id — four fields, each one a fact already on a poster,
          // and an internal identifier is not one of them — and two events do
          // collide on a date here: the live planning had two on 3 October.
          <li
            key={`${event.startsAt}-${event.title}`}
            className="rounded-lg border border-line bg-panel p-4"
          >
            <h3 className="font-display text-xl text-ink">{event.title}</h3>
            <p className="mt-tight text-sm text-ink-muted">
              {formatEventWhen(event.startsAt, event.endsAt)}
            </p>
            <p className="mt-tight text-sm text-ink-muted">{event.location}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

import { ButtonLink } from "@/components/ButtonLink";

import { rowsOf } from "../api/collection";
import { useAgendaIndex } from "../api/generated/endpoints";
import type { PublicEventResource } from "../api/generated/model";
import { formatEventWhen } from "./formatEventWhen";

/** How many appearances the front page shows before it sends people to /agenda. */
const SHOWN = 3;

/**
 * One appearance, as a stranger reads it.
 *
 * NOT EventCard, which is typed on EventResource and renders the dress code,
 * the committee's notes and an answer slot. This has four fields, each one
 * already on a poster, and no caller who may see the rest.
 *
 * Keyed by its CALLER on the start and the title together. The public resource
 * carries no id — an internal identifier is not a fact on a poster — and two
 * events do collide on a date here: the live planning had two on 3 October.
 */
export function AgendaEntry({ event }: { event: PublicEventResource }) {
  return (
    <li className="rounded-lg border border-line bg-panel p-4">
      <h3 className="font-display text-xl text-ink">{event.title}</h3>
      <p className="mt-tight text-sm text-ink-muted">
        {formatEventWhen(event.startsAt, event.endsAt)}
      </p>
      <p className="mt-tight text-sm text-ink-muted">{event.location}</p>
    </li>
  );
}

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
 * /agenda IS THE OPPOSITE CASE, and says so in its own file: somebody who
 * navigated there asked for the schedule and is owed an answer either way.
 * That difference is why these are two components over one endpoint rather
 * than one component with a prop.
 *
 * THREE, NOT ALL OF THEM. A season of carnival dates below the hero is a
 * schedule rather than an invitation, and the rest of them have a page now.
 */
export function PublicAgenda() {
  const agenda = useAgendaIndex();
  const all = rowsOf<PublicEventResource>(agenda.data);
  const upcoming = all.slice(0, SHOWN);

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
          <AgendaEntry key={`${event.startsAt}-${event.title}`} event={event} />
        ))}
      </ul>

      {/* Only when there is more to see. A "toutes les dates" button under a
          list that already IS all the dates sends somebody to a page they have
          just finished reading. */}
      {all.length > SHOWN ? (
        <ButtonLink to="/agenda" variant="outline" className="mt-related">
          Toutes les dates
        </ButtonLink>
      ) : null}
    </section>
  );
}

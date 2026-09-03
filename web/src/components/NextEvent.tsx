import { useEventIndex } from "../api/generated/endpoints";
import { formatTime } from "../lib/date";
import { ButtonLink } from "@/components/ButtonLink";
import { EventCard } from "@/components/EventCard";

/**
 * The next upcoming event, on the front page — or nothing.
 *
 * IT IS CORRECT BECAUSE OF E1a. `GET /api/events` used to return every event
 * ever, ascending, so "the first row" was the OLDEST event in the database and
 * this block would have advertised a concert from years ago. The endpoint
 * filters to upcoming by default now, so taking row zero is right by
 * construction — and there is deliberately no client-side sort or filter here,
 * exactly as on /planning_repet: a change in the API's ordering should fail a
 * test, not be papered over in two places.
 *
 * IT RENDERS NOTHING UNLESS IT HAS AN EVENT, AND THAT IS THE WHOLE DESIGN.
 * Pending, error and an empty list all collapse into `data` being undefined or
 * row zero being missing, so one guard covers all three. There is deliberately
 * no "Chargement…" and no `role="alert"`:
 *
 *   - an empty-state card saying "aucun événement" on a band's front page reads
 *     as "this band does nothing", which is worse than no section;
 *   - the visitor never asked for the schedule, so an error about it is noise
 *     on the page where noise is most visible;
 *   - the spec's stated risk is that this live dependency must never block the
 *     hero or the destinations, and a component that can only add or add
 *     nothing cannot.
 *
 * /planning_repet is the page that DOES owe the visitor a loading state and an
 * error, because there the schedule is what they came for.
 */
export function NextEvent() {
  const events = useEventIndex();

  // `.data.data` — the outer is TanStack Query's, the inner is orval's
  // { data, status, headers } envelope that the mutator in api/http.ts must
  // return. Undefined while pending and on error, both of which end up here.
  const next = events.data?.data[0];
  if (!next) return null;

  return (
    <section className="mt-8">
      <h2 className="font-display text-2xl">Prochain événement</h2>

      {/* A ONE-ITEM <ul>, because EventCard IS an <li> (it uses Card's asChild
          so that /planning_repet's named lists are valid markup). Reusing it
          here is the point: a second, near-identical event card tree would have
          to be kept in step with this one forever, and it is the component that
          already knows a weekend event spans two days.

          Named, so a `listitem` query scoped to this list means exactly one
          thing — the layout's nav is a list too, and an unscoped query once
          counted four events as seventeen rows. The name matches the heading;
          they are different roles, so no query is ambiguous. */}
      <ul aria-label="Prochain événement" className="mt-3">
        <EventCard
          event={next}
          actions={
            <ButtonLink to="/planning_repet" variant="outline">
              Voir tous les événements
            </ButtonLink>
          }
        >
          {/* The same one-line meta as /planning_repet: three labelled lines
              ("Heure de début :", "Heure de fin :", "Lieu :") were mostly label
              on a phone, and the values alone say the same thing. The separator
              is aria-hidden so a screen reader reads the line rather than
              spelling a dot. */}
          <p>
            {formatTime(next.startTime)} – {formatTime(next.endTime)}
            <span aria-hidden="true"> · </span>
            {next.location}
          </p>
        </EventCard>
      </ul>
    </section>
  );
}

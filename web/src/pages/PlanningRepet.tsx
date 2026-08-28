import { useEventIndex } from "../api/generated/endpoints";
import { formatEventDate, formatEventDateRange, formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";

/**
 * The planning of performances and rehearsals.
 *
 * Public: anyone can read the list. Only `manage_events` — admin alone — gets
 * the per-event controls and the form below them. That asymmetry is the whole
 * point of the page and mirrors what the API enforces.
 */
export function PlanningRepet() {
  const { can } = useSession();
  const events = useEventIndex();

  if (events.isPending) {
    return <p className="mx-auto max-w-3xl px-4 py-8">Chargement…</p>;
  }

  if (events.isError) {
    return (
      <p role="alert" className="mx-auto max-w-3xl px-4 py-8">
        Le planning n’a pas pu être chargé. Veuillez réessayer.
      </p>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Planning des prestations et des répétitions</h1>
      <h2 className="text-lg text-gray-600">sous réserve de modifications</h2>

      {/* Named, so it can be distinguished from the navigation's own list —
          both are `listitem`s to a screen reader and to a test, and "17 rows"
          when there are four events is confusing in either. */}
      <ul aria-label="Événements" className="mt-6 space-y-4">
        {/* The API orders by date, so there is no client-side re-sort — the old
            page sorted defensively and that is dropped deliberately. A test
            pins the order, so a change in the API's ordering fails there
            instead of being silently papered over here. */}
        {events.data.data.map((event) => (
          <li key={event.id} className="relative rounded border p-4">
            <p className="font-bold">
              {event.weekend ? formatEventDateRange(event.date) : formatEventDate(event.date)}
            </p>
            <p>
              <strong>Titre :</strong> {event.title}
            </p>
            <p>
              <strong>Heure de début :</strong> {formatTime(event.startTime)}
            </p>
            <p>
              <strong>Heure de fin :</strong> {formatTime(event.endTime)}
            </p>
            <p>
              <strong>Lieu :</strong> {event.location}
            </p>
            {/* Omitted entirely when there is no dress code, as the old page
                did — a rehearsal with no tenue is legitimate, and an empty
                "Tenue :" line reads like missing data. */}
            {event.attire ? (
              <p>
                <strong>Tenue :</strong> {event.attire}
              </p>
            ) : null}

            {can("manage_events") ? <EventActions event={event} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Replaced in the next task with the real create/edit/delete controls. Present
// so the admin path renders nothing rather than failing to compile.
function EventActions(_props: { event: unknown }) {
  return null;
}

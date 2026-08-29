import { useState } from "react";

import { useEventIndex } from "../api/generated/endpoints";
import { formatEventDate, formatEventDateRange, formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { EventActions } from "./EventActions";
import { EventForm, toEditableEvent, type EditableEvent } from "./EventForm";

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

  // Which event the form is editing, or null for "create". It lives here rather
  // than in the form because the per-row buttons are what set it.
  const [editing, setEditing] = useState<EditableEvent | null>(null);

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
      <h1 className="font-display text-4xl">Planning des prestations et des répétitions</h1>
      <h2 className="text-lg text-ink-muted">sous réserve de modifications</h2>

      {/* Named, so it can be distinguished from the navigation's own list —
          both are `listitem`s to a screen reader and to a test, and "17 rows"
          when there are four events is confusing in either. */}
      <ul aria-label="Événements" className="mt-6 space-y-4">
        {/* The API orders by date, so there is no client-side re-sort — the old
            page sorted defensively and that is dropped deliberately. A test
            pins the order, so a change in the API's ordering fails there
            instead of being silently papered over here. */}
        {events.data.data.map((event) => (
          <li
            key={event.id}
            className="relative rounded-lg border border-line bg-panel p-5 shadow-sm"
          >
            <p className="font-bold">
              {event.weekend ? formatEventDateRange(event.date) : formatEventDate(event.date)}
            </p>
            <p>
              <strong className="text-ink-muted font-semibold">Titre :</strong> {event.title}
            </p>
            <p>
              <strong className="text-ink-muted font-semibold">Heure de début :</strong>{" "}
              {formatTime(event.startTime)}
            </p>
            <p>
              <strong className="text-ink-muted font-semibold">Heure de fin :</strong>{" "}
              {formatTime(event.endTime)}
            </p>
            <p>
              <strong className="text-ink-muted font-semibold">Lieu :</strong> {event.location}
            </p>
            {/* Omitted entirely when there is no dress code, as the old page
                did — a rehearsal with no tenue is legitimate, and an empty
                "Tenue :" line reads like missing data. */}
            {event.attire ? (
              <p>
                <strong className="text-ink-muted font-semibold">Tenue :</strong> {event.attire}
              </p>
            ) : null}

            {can("manage_events") ? (
              <EventActions event={toEditableEvent(event)} onEdit={setEditing} />
            ) : null}
          </li>
        ))}
      </ul>

      {can("manage_events") ? (
        // Keyed on the event being edited, so React remounts the form whenever
        // the target changes and it seeds its fields during that render. The
        // alternative — one long-lived form copying the prop into state in an
        // effect — paints an empty form for a frame every time "Modifier" is
        // clicked. See EventForm's own comment, and the e2e test that pins it.
        <EventForm key={editing?.id ?? "new"} editing={editing} onDone={() => setEditing(null)} />
      ) : null}
    </section>
  );
}

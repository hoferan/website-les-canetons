import { useState } from "react";

import { useEventIndex } from "../api/generated/endpoints";
import { formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { EventActions } from "./EventActions";
import { EventForm, toEditableEvent, type EditableEvent } from "./EventForm";
import { EventCard } from "@/components/EventCard";
import { PageSection } from "@/components/PageSection";

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
    return (
      <PageSection width="text">
        <p>Chargement…</p>
      </PageSection>
    );
  }

  if (events.isError) {
    return (
      <PageSection width="text">
        <p role="alert">Le planning n’a pas pu être chargé. Veuillez réessayer.</p>
      </PageSection>
    );
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Planning des prestations et des répétitions</h1>
      <h2 className="text-lg text-ink-muted">sous réserve de modifications</h2>

      {/* Named, so it can be distinguished from the navigation's own list —
          both are `listitem`s to a screen reader and to a test, and "17 rows"
          when there are four events is confusing in either. */}
      <ul aria-label="Événements" className="mt-6 space-y-4">
        {/* The API orders by date and now returns only upcoming events, so
            there is no client-side re-sort and no client-side filter — a test
            pins the order, so a change in the API's ordering fails there
            instead of being silently papered over here. */}
        {events.data.data.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            actions={
              can("manage_events") ? (
                <EventActions event={toEditableEvent(event)} onEdit={setEditing} />
              ) : undefined
            }
          >
            {/* ONE meta line, not three. "Heure de début :", "Heure de fin :"
                and "Lieu :" were three lines of mostly label on a phone; the
                values alone say the same thing. The separator is aria-hidden
                so a screen reader reads the line rather than spelling a dot. */}
            <p>
              {formatTime(event.startTime)} – {formatTime(event.endTime)}
              <span aria-hidden="true"> · </span>
              {event.location}
            </p>
            {/* Omitted entirely when there is no dress code, as the old page
                did — a rehearsal with no tenue is legitimate, and an empty
                "Tenue :" line reads like missing data.

                This one KEEPS its label: it is the detail members scan for and
                the one they get wrong. */}
            {event.attire ? (
              <p className="mt-1">
                <strong className="font-semibold">Tenue :</strong> {event.attire}
              </p>
            ) : null}
          </EventCard>
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
    </PageSection>
  );
}

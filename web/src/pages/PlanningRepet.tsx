import { useState } from "react";
import { Link } from "react-router-dom";

import { useEventIndex } from "../api/generated/endpoints";
import { formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { AnswerControls } from "./AnswerControls";
import { EventActions } from "./EventActions";
import { EventForm, toEditableEvent, type EditableEvent } from "./EventForm";
import { ButtonLink } from "@/components/ButtonLink";
import { EventCard } from "@/components/EventCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageSection } from "@/components/PageSection";

/**
 * The planning of performances and rehearsals.
 *
 * Public: anyone can read the list. Per-event controls depend on capability —
 * `respond` (user/moderator) gets the answer buttons, `view_summary` (admin)
 * gets the Résumé link, `manage_events` (admin) gets edit/delete and the form
 * below the list. The matrix is not a hierarchy: `respond` and `view_summary`
 * never overlap on the same account, so an admin never sees answer buttons.
 * An anonymous visitor gets none of it. This mirrors what the API enforces.
 */
export function PlanningRepet() {
  const { can, user } = useSession();
  const events = useEventIndex();

  // Which event the form is editing, or null for "create". It lives here rather
  // than in the form because the per-row buttons are what set it.
  const [editing, setEditing] = useState<EditableEvent | null>(null);

  // A SECOND query rather than swapping the first one's parameters: the
  // upcoming list must not blank out while the archive loads, and the archive
  // is fetched only if someone asks for it.
  //
  // EventActions invalidates getEventIndexQueryKey(), which is ["/events"];
  // this query's key is ["/events", {include:"past"}]. The first is a PREFIX of
  // the second, and TanStack matches query keys by prefix, so one invalidation
  // refreshes both lists and the archive cannot go stale after a delete.
  const [showingPast, setShowingPast] = useState(false);
  const history = useEventIndex({ include: "past" }, { query: { enabled: showingPast } });

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

  // The API returns one ordering — ascending — for both calls, so the endpoint
  // keeps a single rule and the archive is reversed here. Newest first is what
  // you want of a past list and the opposite of what you want of a future one.
  const past = (history.data?.data ?? [])
    .filter((event) => !events.data.data.some((upcoming) => upcoming.id === event.id))
    .reverse();

  // Anonymous visitors get no footer at all rather than an empty one: an
  // EventCard renders its actions row whenever `actions` is truthy, and a
  // fragment of three nulls is truthy.
  const hasActions = can("respond") || can("view_summary") || can("manage_events");

  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Planning des prestations et des répétitions</h1>
      <h2 className="text-lg text-ink-muted">sous réserve de modifications</h2>

      {/* Shown to ANONYMOUS visitors only. The page is public — anyone may read
          when the band plays — but without this a visitor sees a bare schedule
          with nothing to suggest that signing in lets them answer. A member
          never sees it: they have the buttons. */}
      {!user ? (
        <Card asChild className="mt-6 gap-0 p-4 text-ink-muted">
          <p>
            {/* Underlined at rest, unlike every other inline prose link on the
                site (text-violet hover:underline). Those are a passing
                reference inside body copy; this one IS the hint's entire
                point, so it stays visibly a link rather than blending in. */}
            <Link
              to="/authentification_inscription"
              className="focus-ring font-semibold text-violet underline"
            >
              Connectez-vous
            </Link>{" "}
            pour indiquer votre participation.
          </p>
        </Card>
      ) : null}

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
              hasActions ? (
                <>
                  {/* The capability matrix, on one card. `respond` is user and
                      moderator; `view_summary` and `manage_events` are admin.
                      They do NOT overlap, so an admin gets the summary and the
                      edit controls and NO answer buttons -- which is the whole
                      reason this page can serve every member at once. */}
                  {can("respond") ? (
                    <AnswerControls eventId={event.id} answer={event.response} />
                  ) : null}
                  {can("view_summary") ? (
                    <ButtonLink to={`/inscriptions_admin?id=${event.id}`} variant="outline">
                      Résumé
                    </ButtonLink>
                  ) : null}
                  {can("manage_events") ? (
                    <EventActions event={toEditableEvent(event)} onEdit={setEditing} />
                  ) : null}
                </>
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

      <div className="mt-8">
        <Button
          type="button"
          variant="outline"
          aria-expanded={showingPast}
          aria-controls="past-events"
          onClick={() => setShowingPast((wasShowing) => !wasShowing)}
        >
          {showingPast ? "Masquer les événements passés" : "Voir les événements passés"}
        </Button>

        <div id="past-events" hidden={!showingPast}>
          {history.isPending && showingPast ? <p className="mt-4">Chargement…</p> : null}
          {history.isError ? (
            <p role="alert" className="mt-4">
              Les événements passés n’ont pas pu être chargés. Veuillez réessayer.
            </p>
          ) : null}
          {/* NAMED differently from "Événements", so a listitem query scoped to
              either list means exactly one thing.

              No EventActions here, deliberately: an admin who needs to correct a
              past event still can, through the upcoming list's form, but putting
              delete buttons on an archive invites the misclick they guard
              against. If that turns out to be wanted it is a separate
              decision. */}
          {past.length > 0 ? (
            <ul aria-label="Événements passés" className="mt-4 space-y-4">
              {past.map((event) => (
                <EventCard key={event.id} event={event} className="opacity-75">
                  <p>
                    {formatTime(event.startTime)} – {formatTime(event.endTime)}
                    <span aria-hidden="true"> · </span>
                    {event.location}
                  </p>
                </EventCard>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

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

import { useState } from "react";

import { Button } from "@/components/ui/button";

import { rowsOf } from "../api/collection";
import { useEventIndex } from "../api/generated/endpoints";
import type { EventResource } from "../api/generated/model";
import { ButtonLink } from "../components/ButtonLink";
import { PageSection } from "../components/PageSection";
import { EventCard } from "../events/EventCard";
import { useSession } from "../session/SessionProvider";

/**
 * The planning: what the band is doing, and when.
 *
 * NO PERMISSION TO READ IT. Everybody in the band needs to know when the next
 * rehearsal is, so this screen is gated on having a session and nothing more
 * (RequireSession). Creating and editing are gated on `events.manage`, and
 * those controls are ABSENT rather than refused for everybody else — a link
 * that leads to "Accès refusé" teaches people that parts of the site are
 * broken for them (design §4).
 *
 * THE PAST REPLACES THE PLANNING RATHER THAN EXTENDING IT. It is the other
 * half of the list, not a superset: by next carnival the full history is a
 * hundred rehearsals to scroll past on a phone, and it reads newest-first
 * because history is read backwards from now while the planning ahead is read
 * soonest-first. The API makes the same split, on the start of today rather
 * than on now, so an event that began an hour ago stays in the planning of
 * somebody running late.
 *
 * NO ATTENDANCE HERE. R1c-2 adds the answer buttons and the counts; this
 * release is the planning itself.
 */
export function Events() {
  const { can } = useSession();
  const [showingPast, setShowingPast] = useState(false);

  // `past: "1"` is the magic value the API reads; anything else is the
  // upcoming view. Passing undefined rather than "0" keeps the query string
  // absent altogether, which is what the default case looks like on the wire.
  const planning = useEventIndex(showingPast ? { past: "1" } : undefined);

  // Through rowsOf, which owns the status narrowing and the collection
  // envelope's own `data` hop — see web/src/api/collection.ts.
  const events = rowsOf<EventResource>(planning.data);

  const mayManage = can("events.manage");

  return (
    <PageSection>
      <div className="flex flex-wrap items-center justify-between gap-related">
        <h1 className="font-display text-3xl">Planning</h1>

        {mayManage ? (
          <div className="flex flex-wrap gap-tight">
            <ButtonLink to="/events/new">Ajouter un événement</ButtonLink>
            <ButtonLink to="/events/new/series" variant="outline">
              Ajouter une série
            </ButtonLink>
          </div>
        ) : null}
      </div>

      <div className="mt-related">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowingPast((showing) => !showing)}
        >
          {showingPast ? "Voir le planning" : "Voir les événements passés"}
        </Button>
      </div>

      {planning.isPending ? <p className="mt-block text-ink-muted">Chargement…</p> : null}

      {planning.isError ? (
        <p role="alert" className="mt-block text-red-700">
          Le planning n’a pas pu être chargé.
        </p>
      ) : null}

      {/* The empty branch SAYS SOMETHING. A blank screen reads as broken, and
          this is the state a committee sees before they have entered the
          season — the first thing they will ever see on this page. */}
      {!planning.isPending && !planning.isError && events.length === 0 ? (
        <div className="mt-block">
          <p className="text-ink-muted">
            {showingPast ? "Aucun événement passé." : "Aucun événement au planning."}
          </p>
          {mayManage && !showingPast ? (
            <p className="mt-tight text-sm text-ink-muted">
              Ajoutez un événement, ou générez toute une saison d’un coup avec «&nbsp;Ajouter une
              série&nbsp;».
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-block grid gap-related">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            // The card decides nothing about permissions — see its docblock.
            // A player is passed no actions at all, so their card has no empty
            // control row rather than a row of refusals.
            actions={
              mayManage ? (
                <ButtonLink
                  to={`/events/${event.id}/edit`}
                  variant="outline"
                  ariaLabel={`Modifier ${event.title}`}
                >
                  Modifier
                </ButtonLink>
              ) : null
            }
          />
        ))}
      </div>
    </PageSection>
  );
}

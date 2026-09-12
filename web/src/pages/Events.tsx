import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { rowsOf } from "../api/collection";
import {
  eventDestroy,
  eventShow,
  getEventIndexQueryKey,
  useEventIndex,
} from "../api/generated/endpoints";
import type { EventResource } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { ButtonLink } from "../components/ButtonLink";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
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
  const queryClient = useQueryClient();
  const [showingPast, setShowingPast] = useState(false);

  const destructive = useApiFormError("La suppression a échoué.");

  // The event being deleted, together with the tag of the read the dialog was
  // opened from. DELETE is a conditional write, and the planning hands out no
  // tag of its own: one tag cannot validate five rows, and a list-wide one
  // would refuse every delete whenever anybody touched anything. So opening
  // the dialog is also the read, which is where "while this dialog was open"
  // starts. Built by hand over the generated function because the header
  // differs per call — see web/src/api/ifMatch.ts.
  const [deleting, setDeleting] = useState<{ event: EventResource; etag: string | null } | null>(
    null,
  );
  const [opening, setOpening] = useState<number | null>(null);

  const destroy = useMutation({
    mutationFn: ({ event, etag }: { event: number; etag: string }) =>
      eventDestroy(event, ifMatch(etag)),
  });

  // `past: "1"` is the magic value the API reads; anything else is the
  // upcoming view. Passing undefined rather than "0" keeps the query string
  // absent altogether, which is what the default case looks like on the wire.
  const planning = useEventIndex(showingPast ? { past: "1" } : undefined);

  // Through rowsOf, which owns the status narrowing and the collection
  // envelope's own `data` hop — see web/src/api/collection.ts.
  const events = rowsOf<EventResource>(planning.data);

  const mayManage = can("events.manage");

  async function openDelete(row: EventResource) {
    destructive.clear();
    setOpening(row.id);
    try {
      const response = await eventShow(row.id);
      if (response.status === 200) {
        setDeleting({ event: response.data, etag: entityTagOf(response) });
      }
    } catch (thrown) {
      // Announced rather than swallowed: a dialog that never opens reads as a
      // dead button, and the reason is usually worth knowing (the event has
      // already gone, or the session has).
      destructive.setFromThrown(thrown);
    } finally {
      setOpening(null);
    }
  }

  async function confirmDelete() {
    if (deleting === null) {
      return;
    }
    if (deleting.etag === null) {
      // Without a tag the write is refused with 428, which on screen is
      // indistinguishable from a broken button.
      return;
    }

    try {
      await destroy.mutateAsync({ event: deleting.event.id, etag: deleting.etag });
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      setDeleting(null);
    } catch (thrown) {
      // The dialog STAYS OPEN, which is why the confirm button is a plain
      // Button rather than Radix's AlertDialogAction: a 412 has to be readable
      // where it happened, next to the event it is about.
      destructive.setFromThrown(thrown);
    }
  }

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
                <>
                  <ButtonLink
                    to={`/events/${event.id}/edit`}
                    variant="outline"
                    ariaLabel={`Modifier ${event.title}`}
                  >
                    Modifier
                  </ButtonLink>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={`Supprimer ${event.title}`}
                    aria-disabled={opening === event.id}
                    onClick={() => {
                      if (opening === event.id) {
                        return;
                      }
                      void openDelete(event);
                    }}
                  >
                    Supprimer
                  </Button>
                </>
              ) : null
            }
          />
        ))}
      </div>

      {/*
        NO TYPED PHRASE for an event, unlike a member. Typing a name back is
        the price of an action that destroys somebody's history and cannot be
        undone; an event the committee mistyped a minute ago costs them the
        minute. What the dialog owes is the NAME of what it is about to take,
        and what goes with it — the API deletes every attendance answer and
        every public booking attached to the event.
      */}
      <ConfirmByTypingName
        open={deleting !== null}
        title={`Supprimer « ${deleting?.event.title ?? ""} » ?`}
        description="L’événement sera retiré du planning. Les réponses de présence et les inscriptions liées seront supprimées avec lui. Cette action est définitive."
        confirmLabel="Supprimer"
        busy={destroy.isPending}
        error={destructive.error}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          destructive.clear();
          setDeleting(null);
        }}
      />
    </PageSection>
  );
}

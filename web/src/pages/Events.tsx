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
import { AttendanceControls } from "../events/AttendanceControls";
import { EventCalendar } from "../events/EventCalendar";
import { EventCard } from "../events/EventCard";
import { bandZoneParts } from "../events/bandTime";
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
 * ORDERED BY URGENCY, NOT BY DATE. Unanswered upcoming events are pinned to
 * the top under "À répondre"; the planning follows below. This is why the old
 * site needed a second page, /inscriptions_utilisateurs — under this design
 * that page has no reason to exist, because "my answers" IS the top of the one
 * screen.
 *
 * THE TWO BLOCKS PARTITION THE LIST rather than the top one repeating rows
 * from the bottom. Answering therefore moves a card down, out of the block of
 * things still owed — which is the feedback that the tap landed, and what lets
 * "À répondre" mean something when it is empty. A card in both places would be
 * two live sets of answer buttons for one event.
 */
export function Events() {
  const { can, user, config } = useSession();
  const queryClient = useQueryClient();
  const [showingPast, setShowingPast] = useState(false);

  // The calendar, and the day it has filtered the list down to. Both are here
  // rather than inside EventCalendar because the filter is what the calendar
  // is FOR: it does not navigate, it narrows the list below it (C8).
  const [showingCalendar, setShowingCalendar] = useState(false);
  const [day, setDay] = useState<string | null>(null);

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
  const allEvents = rowsOf<EventResource>(planning.data);

  const mayManage = can("events.manage");
  // OFF EVERYWHERE until somebody has looked at it on TEST. The flag comes
  // from GET /api/v1/config, so it is the server's answer rather than
  // something baked into a bundle three environments share.
  const calendarEnabled = config.features?.calendar === true;
  const maySeeAnswers = can("attendance.view_all");

  // Applied BEFORE the split, so a chosen day narrows both blocks. The day is
  // the Fribourg one, which is what bandZoneParts is for: slicing the ISO
  // string would file a 00:30 event under the previous day.
  const events =
    day === null
      ? allEvents
      : allEvents.filter((event) => bandZoneParts(event.startsAt).date === day);

  // The split that makes the top block a to-do list. Two things are never in
  // it. PAST EVENTS, because the screen asks what you owe an answer on and
  // nobody is owed an answer about last Saturday. And EVERYTHING, for somebody
  // who is in no register: `myAttendance` is null on every event for Dominique
  // Direction, who organises and plays nothing, so the naive split would file
  // the whole planning under "À répondre" and then show her no way to answer
  // any of it.
  const answerable = (user?.isPlayer ?? false) && !showingPast;
  const awaiting = answerable ? events.filter((event) => event.myAttendance === null) : [];
  const planned = answerable ? events.filter((event) => event.myAttendance !== null) : events;

  function card(event: EventResource) {
    return (
      <EventCard
        key={event.id}
        event={event}
        // The card decides nothing about permissions — see its docblock. A
        // player is passed no actions at all, so their card has no empty
        // control row rather than a row of refusals.
        actions={
          mayManage || maySeeAnswers ? (
            <>
              {maySeeAnswers ? (
                <ButtonLink
                  to={`/events/${event.id}/attendance`}
                  variant="outline"
                  ariaLabel={`Qui vient à ${event.title}`}
                >
                  Qui vient&nbsp;?
                </ButtonLink>
              ) : null}
              {mayManage ? (
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
              ) : null}
            </>
          ) : null
        }
        // NOT ON THE PAST. The API would accept the write, but a pair of
        // buttons asking whether you are coming to a rehearsal that finished
        // last week is an invitation to nonsense, and the chase list is where a
        // late correction belongs.
        answer={showingPast ? undefined : <AttendanceControls event={event} />}
      />
    );
  }

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

      <div className="mt-related flex flex-wrap items-center gap-tight">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowingPast((showing) => !showing)}
        >
          {showingPast ? "Voir le planning" : "Voir les événements passés"}
        </Button>

        {/* md AND UP ONLY, and absent from a phone altogether rather than
            shrunk onto one. A month grid is for somebody planning a season at
            a desk; the list is the whole phone view and stays the default
            everywhere (C8). */}
        {calendarEnabled ? (
          <Button
            type="button"
            variant="outline"
            className="hidden md:inline-flex"
            aria-pressed={showingCalendar}
            onClick={() => {
              setShowingCalendar((showing) => !showing);
              setDay(null);
            }}
          >
            {showingCalendar ? "Liste" : "Calendrier"}
          </Button>
        ) : null}
      </div>

      {calendarEnabled && showingCalendar ? (
        <div className="mt-block hidden md:block">
          <EventCalendar events={allEvents} selected={day} onSelect={setDay} />
        </div>
      ) : null}

      {/* VISIBLE AT EVERY WIDTH, unlike the calendar that sets it. A narrowed
          list whose only control has just been hidden by a resize is a
          planning that has silently lost most of its events. */}
      {day !== null ? (
        <p className="mt-related flex flex-wrap items-center gap-tight text-sm">
          <span data-testid="day-filter" className="text-ink-muted">
            Filtré sur un jour.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setDay(null)}>
            Voir tout le planning
          </Button>
        </p>
      ) : null}

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

      {awaiting.length > 0 ? (
        <section className="mt-block" aria-labelledby="awaiting-heading">
          <h2 id="awaiting-heading" className="font-display text-xl">
            À répondre
          </h2>
          <div className="mt-related grid gap-related">{awaiting.map(card)}</div>
        </section>
      ) : null}

      {/* The heading appears only when there is a block above it to be
          distinguished from. On a phone, a lone "Planning" under a page titled
          "Planning" is a line of chrome costing a line of screen. */}
      <section
        className="mt-block"
        aria-labelledby={awaiting.length > 0 ? "planning-heading" : undefined}
      >
        {awaiting.length > 0 ? (
          <h2 id="planning-heading" className="font-display text-xl">
            {showingPast ? "Événements passés" : "Le reste du planning"}
          </h2>
        ) : null}
        <div className="mt-related grid gap-related">{planned.map(card)}</div>
      </section>

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

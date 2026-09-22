import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";

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
import { RowActions, type RowAction } from "../components/RowActions";
import { AttendanceControls } from "../events/AttendanceControls";
import { EventCalendar } from "../events/EventCalendar";
import { EventCard } from "../events/EventCard";
import { EventMeta } from "../events/EventMeta";
import { bandZoneParts } from "../events/bandTime";
import { t } from "../i18n";
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
 * ORDERED BY URGENCY, NOT BY DATE, as of when the screen was built. Events
 * that were unanswered then are pinned to the top under "À répondre"; the
 * planning follows below. This is why the old site needed a second page,
 * /inscriptions_utilisateurs — under this design that page has no reason to
 * exist, because "my answers" IS the top of the one screen.
 *
 * THE TWO BLOCKS PARTITION THE LIST rather than the top one repeating rows
 * from the bottom: a card in both places would be two live sets of answer
 * buttons for one event. That still holds, because the block a card is in is
 * decided once, when the list is built.
 *
 * ANSWERING MOVES NOTHING (#95). The card stays where the thumb found it,
 * marked "Répondu", and only settles into the block below on the next load, on
 * the past toggle, or on a day chosen or cleared. Until this, answering the
 * top card dropped it out of the block at once and the next event's buttons
 * arrived within a few pixels of where the finger had just been — so making
 * the answer instant made a mis-tap MORE likely rather than less. Three things
 * follow, and the third is the one that decided it:
 *
 *   - THE MOVE WAS NEVER THE FEEDBACK. The fill, `aria-pressed`, the marker
 *     and the toast are; the move was feedback about classification, and on a
 *     phone its destination is several screens down. What the reader saw was
 *     the card they tapped vanishing and a different event taking its place.
 *   - ANIMATING IT WAS REJECTED, not deferred. It decorates the hazard rather
 *     than removing it — the next card still arrives under the thumb, only
 *     later and in motion — and styles.css flattens every duration under
 *     `prefers-reduced-motion`, so the protection would be off for exactly the
 *     people who asked the platform for predictability. A timer was rejected
 *     too: it trades a movement somebody caused for one with no cause at all.
 *   - A MOVE COSTS THE FOCUS. The blocks are two parents, so moving a card
 *     between them unmounts the node the focus is on: every answer sent a
 *     keyboard or screen-reader user back to the top of the page. Held in
 *     place, the pressed button keeps focus and announces itself.
 *
 * "À répondre" therefore still means something when it is empty — it is a
 * state you arrive at rather than one you watch happen — and what carries the
 * to-do semantics while you are on the screen is the count under the heading.
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

  const destructive = useApiFormError(t("events.deleteFailed"));

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
  const maySeeGuests = can("registrations.view");

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

  // WHAT WAS OWED WHEN THIS LIST WAS BUILT, which is what the top block
  // partitions on rather than on `myAttendance` as it stands (#95). Answering
  // therefore leaves the card where the thumb found it — see the docblock for
  // why that beats moving it, and why neither a timer nor an animation does.
  //
  // The scope is the identity of the list itself, so re-scoping it is exactly
  // what releases the hold: a new mount, the past toggle, a day chosen or
  // cleared on the calendar. Data arriving is NOT a settle — a background
  // refetch must not move a card the reader is looking at.
  const scope = `${showingPast}|${day ?? ""}`;
  const [owed, setOwed] = useState<{ scope: string; ids: Set<number> } | null>(null);

  if (!planning.isPending && owed?.scope !== scope) {
    // Set during render, which React answers by re-rendering before it commits
    // anything — the documented way to derive state from something that
    // changed. An effect would paint one frame of the wrong partition first.
    setOwed({
      scope,
      ids: new Set(events.filter((event) => event.myAttendance === null).map((event) => event.id)),
    });
  }

  const held = owed?.scope === scope ? owed.ids : new Set<number>();
  const stillOwed = (event: EventResource) => event.myAttendance === null || held.has(event.id);

  const awaiting = answerable ? events.filter(stillOwed) : [];
  const planned = answerable ? events.filter((event) => !stillOwed(event)) : events;

  // What the heading's count is about: the answers still missing, which is not
  // the size of the block any more. An event created since the list was built
  // is unanswered and therefore in here too, which is why this counts rather
  // than reading the snapshot.
  const missing = awaiting.filter((event) => event.myAttendance === null).length;

  // WHETHER THE PLANNED-EVENTS SECTION GETS A HEADING (#182) — see the JSX
  // site below for the full reasoning. Never over an empty list either: a
  // heading names what is under it.
  const showHeading = planned.length > 0 && (showingPast || awaiting.length > 0);

  function card(event: EventResource, inOwed: boolean) {
    // WHAT THIS READER MAY DO TO THIS EVENT, as data rather than as markup.
    // The screen still decides which actions exist — three permissions gate
    // them independently — and RowActions decides only which one stays inline
    // and which go behind the "..." (#118). Neither the card nor RowActions
    // calls can().
    const actions: RowAction[] = [];

    if (maySeeAnswers) {
      actions.push({
        key: "attendance",
        // THE SAME KEY AS THE SCREEN IT OPENS, so the link and its
        // destination cannot come to disagree.
        label: t("attendance.heading"),
        ariaLabel: t("events.whoComingAria", { title: event.title }),
        to: `/events/${event.id}/attendance`,
      });
    }

    // ONLY ON AN EVENT THAT TAKES BOOKINGS. Every other card would otherwise
    // carry a link to an empty list that can never fill up, and the planning
    // is mostly rehearsals. `takesRegistrations` is the server's own
    // derivation from the closing date.
    if (maySeeGuests && event.takesRegistrations) {
      actions.push({
        key: "registrations",
        label: t("events.registrations"),
        ariaLabel: t("events.registrationsAria", { title: event.title }),
        to: `/events/${event.id}/registrations`,
      });
    }

    if (mayManage) {
      actions.push(
        {
          key: "options",
          label: t("events.options"),
          ariaLabel: t("events.optionsAria", { title: event.title }),
          to: `/events/${event.id}/registration-options`,
        },
        {
          key: "edit",
          label: t("common.edit"),
          ariaLabel: t("events.editAria", { title: event.title }),
          to: `/events/${event.id}/edit`,
        },
        {
          key: "delete",
          label: t("common.delete"),
          ariaLabel: t("events.deleteAria", { title: event.title }),
          // Inert while the read the dialog opens from is in flight, so a
          // second press cannot start a second one.
          disabled: opening === event.id,
          destructive: true,
          onSelect: () => void openDelete(event),
        },
      );
    }

    return (
      <EventCard
        key={event.id}
        event={event}
        // The card decides nothing about permissions — see its docblock. A
        // player is passed no actions at all, so their card has no empty
        // control row rather than a row of refusals.
        actions={
          actions.length > 0 ? (
            <RowActions
              actions={actions}
              // The weekly one. When the reader does not hold
              // attendance.view_all it is simply absent, and RowActions
              // promotes whatever is first — see its docblock.
              inlineKey="attendance"
              rowName={event.title}
            />
          ) : null
        }
        // NOT ON THE PAST. The API would accept the write, but a pair of
        // buttons asking whether you are coming to a rehearsal that finished
        // last week is an invitation to nonsense, and the chase list is where a
        // late correction belongs.
        answer={showingPast ? undefined : <AttendanceControls event={event} inOwed={inOwed} />}
        // WHAT THE SCREEN DECIDES, mirroring the API's gates for UX only —
        // the numbers are already null for anybody who may not see them, so
        // this suppresses an empty strip rather than protecting anything.
        meta={
          <EventMeta
            isPublic={mayManage ? event.isPublic : undefined}
            answered={maySeeAnswers ? (event.answeredCount ?? undefined) : undefined}
            answerable={maySeeAnswers ? (event.answerableCount ?? undefined) : undefined}
            guests={
              maySeeGuests && event.takesRegistrations ? (event.guestCount ?? undefined) : undefined
            }
          />
        }
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
        <h1 className="font-display text-3xl">{t("events.heading")}</h1>

        {mayManage ? (
          <div className="flex flex-wrap gap-tight">
            <ButtonLink to="/events/new">{t("events.add")}</ButtonLink>
            <ButtonLink to="/events/new/series" variant="outline">
              {t("events.addSeries")}
            </ButtonLink>
          </div>
        ) : null}
      </div>

      <div className="mt-related flex flex-wrap items-center gap-tight">
        {/* WHICH HALF OF THE LIST, as a switch rather than as a button. It was
            a 213px imperative sentence in the same `variant="outline"` as the
            calendar toggle beside it, so it read as a third thing to DO; and it
            carried no state at all, unlike that neighbour, so nothing announced
            which view was on screen. #182.

            NO GUARD ON THE INCOMING VALUE, and that is a property of the
            primitive rather than an omission here: a radio group cannot be
            cleared by its user, so `next` is always one of the two values
            below. ui/radio-group.tsx's docblock records what ToggleGroup would
            have cost instead. */}
        <RadioGroup
          value={showingPast ? "past" : "planning"}
          orientation="horizontal"
          aria-label={t("events.viewSwitchAria")}
          onValueChange={(next: string) => setShowingPast(next === "past")}
        >
          <ToggleOption value="planning">{t("events.viewPlanning")}</ToggleOption>
          <ToggleOption value="past">{t("events.viewPast")}</ToggleOption>
        </RadioGroup>

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
            {showingCalendar ? t("events.list") : t("events.calendar")}
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
            {t("events.dayFiltered")}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setDay(null)}>
            {t("events.showAll")}
          </Button>
        </p>
      ) : null}

      {planning.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      {planning.isError ? (
        <p role="alert" className="mt-block text-red-700">
          {t("events.loadFailed")}
        </p>
      ) : null}

      {/* The empty branch SAYS SOMETHING. A blank screen reads as broken, and
          this is the state a committee sees before they have entered the
          season — the first thing they will ever see on this page. */}
      {!planning.isPending && !planning.isError && events.length === 0 ? (
        <div className="mt-block">
          <p className="text-ink-muted">
            {showingPast ? t("events.emptyPast") : t("events.empty")}
          </p>
          {mayManage && !showingPast ? (
            <p className="mt-tight text-sm text-ink-muted">
              {/* THE HINT QUOTES THE BUTTON BESIDE IT, so the label is read
                  from the same key that renders it rather than written out a
                  second time -- and the guillemets travel in the string,
                  because French spaces them and German does not. */}
              {t("events.emptyHint", { action: t("events.addSeries") })}
            </p>
          ) : null}
        </div>
      ) : null}

      {awaiting.length > 0 ? (
        <section className="mt-block" aria-labelledby="awaiting-heading">
          <h2 id="awaiting-heading" className="font-display text-xl">
            {t("events.owedHeading")}
          </h2>

          {/* THE COUNT CARRIES THE TO-DO SEMANTICS the move used to carry, and
              it is a sibling of the heading rather than part of it: the h2 is
              this region's accessible name, and folding a number into it
              renames the region every time somebody answers. One line at
              375px in both wordings, so the last answer of a session does not
              reflow the list it was meant to hold still. */}
          <p data-testid="owed-count" aria-live="polite" className="mt-tight text-ink-muted">
            {/* ZERO IS ITS OWN SENTENCE, not a plural form: "Tout est
                répondu" is not the plural of anything, and neither French nor
                German has a `_zero` category. Above zero the catalogue
                decides, because German moves the VERB as well as the noun --
                "Es fehlt" against "Es fehlen" -- which the `missing === 1`
                ternary that used to be here could never have carried. */}
            {missing === 0 ? t("events.allAnswered") : t("events.owedCount", { count: missing })}
          </p>

          <div className="mt-related grid gap-related">
            {awaiting.map((event) => card(event, true))}
          </div>
        </section>
      ) : null}

      {/* SUPPRESSED IN THE UPCOMING VIEW ONLY, when there is no block above it
          to be distinguished from: a lone "Planning" under a page titled
          "Planning" is a line of chrome costing a line of screen. ALWAYS
          PRESENT IN THE PAST VIEW, where "Événements passés" is the only
          thing on the page saying which half is on screen (#182). NEVER OVER
          AN EMPTY LIST EITHER, in either view: a heading names the list
          beneath it, and the empty-message block above renders instead —
          the two are alternatives, not siblings. */}
      <section className="mt-block" aria-labelledby={showHeading ? "planning-heading" : undefined}>
        {showHeading ? (
          <h2 id="planning-heading" className="font-display text-xl">
            {showingPast ? t("events.pastHeading") : t("events.restHeading")}
          </h2>
        ) : null}
        <div className="mt-related grid gap-related">
          {planned.map((event) => card(event, false))}
        </div>
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
        title={t("events.deleteTitle", { title: deleting?.event.title ?? "" })}
        description={t("events.deleteDescription")}
        confirmLabel={t("common.delete")}
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

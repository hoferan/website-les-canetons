import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";
import { ChevronDown, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { rowsOf } from "../api/collection";
import {
  eventDestroy,
  eventPublish,
  eventShow,
  eventUnpublish,
  getEventIndexQueryKey,
  useEventIndex,
  useEventTagIndex,
} from "../api/generated/endpoints";
import type { EventResource, EventTagResource } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { ConfirmByTypingName } from "../components/ConfirmByTypingName";
import { PageSection } from "../components/PageSection";
import { RowActions, type RowAction } from "../components/RowActions";
import { SearchField, useDebouncedValue } from "../components/SearchField";
import { AttendanceControls } from "../events/AttendanceControls";
import { EventCalendar } from "../events/EventCalendar";
import { EventCard } from "../events/EventCard";
import { EventMeta } from "../events/EventMeta";
import { SeriesCreatedNotice } from "../events/SeriesCreatedNotice";
import { TagFilter, shownTag } from "../events/TagFilter";
import { bandZoneParts } from "../events/bandTime";
import { isDraft } from "../events/eventDates";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * The planning: what the band is doing, and when.
 *
 * Everybody may read it: the screen asks for `events.view`, which the
 * baseline role grants to every account. Creating and editing need
 * `events.manage`, and those controls are absent for everybody else, because
 * a link that leads to "Accès refusé" reads as a broken site.
 *
 * The past view replaces the planning instead of extending it, and reads
 * newest-first while the planning reads soonest-first. The API splits on the
 * start of today, so an event that began an hour ago stays in the planning.
 *
 * Events unanswered when the list was built sit on top under "À répondre",
 * and the rest of the planning follows. The blocks partition the list: a card
 * in both would be two live sets of answer buttons for one event.
 *
 * Answering moves nothing (#95). The card stays where the thumb found it,
 * marked "Répondu", and settles into the block below only on the next load,
 * the past toggle or a day chosen or cleared. Moving it at once put the next
 * event's buttons under the finger, and unmounted the focused node, sending a
 * keyboard or screen-reader user back to the top. An animation or a timer
 * would still bring the next card under the thumb, and styles.css flattens
 * durations under `prefers-reduced-motion`. While on the screen, the count
 * under the heading carries the to-do meaning.
 */
export function Events() {
  const { can, config } = useSession();
  const queryClient = useQueryClient();
  const [showingPast, setShowingPast] = useState(false);

  // The calendar and the day it filters the list to live here, outside
  // EventCalendar, because the calendar does not navigate: it narrows the
  // list below it.
  const [showingCalendar, setShowingCalendar] = useState(false);
  const [day, setDay] = useState<string | null>(null);

  // The search runs on the server: unlike the day filter, it has to see the
  // whole list, and only the server does once the envelope cuts it short.
  // The request follows the box once it has been still for 250ms.
  const [typed, setTyped] = useState("");
  const q = useDebouncedValue(typed.trim());

  // The tag filter runs on the server too, for the same reason. `tag` is
  // derived through shownTag() instead of reset in an effect, so a tag
  // deleted while it was chosen never reaches the request.
  const tagList = rowsOf<EventTagResource>(useEventTagIndex().data);
  const [chosenTag, setChosenTag] = useState<number | null>(null);
  const tag = shownTag(chosenTag, tagList);

  const destructive = useApiFormError(t("events.deleteFailed"));

  // Publishing and unpublishing share one error, shown above the list. A
  // refusal from publish names the fields the draft is still missing, and the
  // message has to be read next to the card it is about.
  const publishing = useApiFormError(t("events.publishFailed"));

  // The event being deleted, with the tag of the read the dialog opened from.
  // DELETE is a conditional write and the list hands out no per-row tag, so
  // opening the dialog is also the read. Built by hand over the generated
  // function because the header differs per call: see web/src/api/ifMatch.ts.
  const [deleting, setDeleting] = useState<{ event: EventResource; etag: string | null } | null>(
    null,
  );
  const [opening, setOpening] = useState<number | null>(null);
  const [working, setWorking] = useState<number | null>(null);

  const destroy = useMutation({
    mutationFn: ({ event, etag }: { event: number; etag: string }) =>
      eventDestroy(event, ifMatch(etag)),
  });

  // The API reads `past: "1"`; anything else is the upcoming view, so the
  // default sends no query string at all. The previous answer stays on screen
  // while a new search loads, so typing does not blank the list per keystroke.
  const params = {
    ...(showingPast ? { past: "1" as const } : {}),
    ...(q === "" ? {} : { q }),
    ...(tag === null ? {} : { tag }),
  };
  const planning = useEventIndex(Object.keys(params).length > 0 ? params : undefined, {
    query: { placeholderData: keepPreviousData },
  });

  const allEvents = rowsOf<EventResource>(planning.data);

  const mayManage = can("events.manage");
  // Off unless the server switches it on (FEATURE_CALENDAR). The flag comes
  // from GET /api/v1/config because every environment runs the same bundle.
  const calendarEnabled = config.features?.calendar === true;
  const maySeeAnswers = can("attendance.view_all");
  const maySeeGuests = can("registrations.view");

  // Applied before the split, so a chosen day narrows both blocks. The day is
  // the Fribourg one: slicing the ISO string would file a 00:30 event under
  // the previous day.
  const shown =
    day === null
      ? allEvents
      : allEvents.filter(
          (event) => event.startsAt !== null && bandZoneParts(event.startsAt).date === day,
        );

  // Drafts are their own group above the planning and stay out of the to-do
  // partition: nobody owes an answer about an event the band has not been
  // told about. Only somebody with events.manage is sent any.
  const drafts = shown.filter(isDraft);
  const events = shown.filter((event) => !isDraft(event));

  // The split that makes the top block a to-do list. Past events never enter
  // it, and nothing does for somebody without attendance.respond:
  // `myAttendance` is null on every event for somebody who organises and plays
  // nothing, so the split would file the whole planning as owed with no way
  // to answer it. The permission decides this, not the register.
  const answerable = can("attendance.respond") && !showingPast;

  // The top block partitions on what was owed when this list was built, not
  // on `myAttendance` as it stands, so answering leaves the card in place
  // (#95, see the docblock).
  //
  // The scope is the identity of the list, so changing it releases the hold:
  // a new mount, the past toggle, a day, a search. Data arriving does not, so
  // a background refetch cannot move a card the reader is looking at. No
  // snapshot is taken while keepPreviousData shows the last search's rows, or
  // it would pin them under the new one.
  const scope = `${showingPast}|${day ?? ""}|${q}`;
  const [owed, setOwed] = useState<{ scope: string; ids: Set<number> } | null>(null);

  if (!planning.isPending && !planning.isPlaceholderData && owed?.scope !== scope) {
    // Set during render, so React re-renders before committing. An effect
    // would paint one frame of the wrong partition first.
    setOwed({
      scope,
      ids: new Set(events.filter((event) => event.myAttendance === null).map((event) => event.id)),
    });
  }

  const held = owed?.scope === scope ? owed.ids : new Set<number>();
  const stillOwed = (event: EventResource) => event.myAttendance === null || held.has(event.id);

  const awaiting = answerable ? events.filter(stillOwed) : [];
  const planned = answerable ? events.filter((event) => !stillOwed(event)) : events;

  // The heading's count is the answers still missing, which is not the size
  // of the block. It counts instead of reading the snapshot because an event
  // created since the list was built is unanswered too.
  const missing = awaiting.filter((event) => event.myAttendance === null).length;

  // Whether the planned section gets a heading (#182): see the JSX below. A
  // drafts group above it needs one too, or the planned cards run straight on
  // from the drafts.
  const showHeading =
    planned.length > 0 && (showingPast || awaiting.length > 0 || drafts.length > 0);

  function card(event: EventResource, inOwed: boolean) {
    // What this reader may do to this event, as data. The screen decides which
    // actions exist; RowActions decides only which one stays inline and which
    // go behind the "...". Neither the card nor RowActions calls can().
    const actions: RowAction[] = [];

    if (maySeeAnswers && !isDraft(event)) {
      actions.push({
        key: "attendance",
        // The same key as the screen it opens, so the two cannot disagree.
        label: t("attendance.heading"),
        ariaLabel: t("events.whoComingAria", { title: event.title }),
        to: `/events/${event.id}/attendance`,
      });
    }

    // Only on an event that takes bookings, or most cards would link to a list
    // that can never fill up. `takesRegistrations` is the server's derivation
    // from the closing date.
    if (maySeeGuests && event.takesRegistrations && !isDraft(event)) {
      actions.push({
        key: "registrations",
        label: t("events.registrations"),
        ariaLabel: t("events.registrationsAria", { title: event.title }),
        to: `/events/${event.id}/registrations`,
      });
    }

    // Publishing is what a draft is for, so it is promoted inline. A draft has
    // no chase list and no guest list: nothing can be answered or booked yet.
    if (mayManage && isDraft(event)) {
      actions.push({
        key: "publish",
        label: t("events.publish"),
        ariaLabel: t("events.publishAria", { title: event.title }),
        disabled: working === event.id,
        onSelect: () => void changePublication(event, "publish"),
      });
    }

    if (mayManage) {
      actions.push(
        {
          key: "options",
          label: t("events.options"),
          ariaLabel: t("events.optionsAria", { title: event.title }),
          to: `/events/${event.id}/book/edit`,
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

      if (!isDraft(event)) {
        actions.push({
          key: "unpublish",
          label: t("events.unpublish"),
          ariaLabel: t("events.unpublishAria", { title: event.title }),
          disabled: working === event.id,
          onSelect: () => void changePublication(event, "unpublish"),
        });
      }
    }

    return (
      <EventCard
        key={event.id}
        event={event}
        // The card decides nothing about permissions. A player is passed no
        // actions, so their card has no empty control row.
        actions={
          actions.length > 0 ? (
            <RowActions
              actions={actions}
              // Without attendance.view_all this key is absent, and
              // RowActions promotes whatever is first.
              inlineKey={isDraft(event) ? "publish" : "attendance"}
              rowName={event.title}
            />
          ) : null
        }
        // Not on the past. The API would accept the write, but a late
        // correction belongs on the chase list.
        answer={
          showingPast || isDraft(event) ? undefined : (
            <AttendanceControls event={event} inOwed={inOwed} />
          )
        }
        // Mirrors the API's gates for UX only: the numbers are already null for
        // anybody who may not see them, so this only suppresses an empty strip.
        meta={
          <EventMeta
            tags={event.tags}
            isPublic={mayManage ? event.isPublic : undefined}
            // Not on a draft: nobody can answer it until it is published.
            answered={
              maySeeAnswers && !isDraft(event) ? (event.answeredCount ?? undefined) : undefined
            }
            answerable={
              maySeeAnswers && !isDraft(event) ? (event.answerableCount ?? undefined) : undefined
            }
            guests={
              maySeeGuests && event.takesRegistrations ? (event.guestCount ?? undefined) : undefined
            }
          />
        }
      />
    );
  }

  /**
   * Publish a draft, or put a published event back.
   *
   * Both are conditional writes, so like the delete they start from a read of
   * the one event for its tag. A refusal stays on screen above the list,
   * naming the missing fields or the answers in the way.
   */
  async function changePublication(row: EventResource, direction: "publish" | "unpublish") {
    publishing.clear();
    setWorking(row.id);
    try {
      const read = await eventShow(row.id);
      const etag = read.status === 200 ? entityTagOf(read) : null;
      if (etag === null) {
        return;
      }
      await (direction === "publish"
        ? eventPublish(row.id, ifMatch(etag))
        : eventUnpublish(row.id, ifMatch(etag)));
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
    } catch (thrown) {
      publishing.setFromThrown(thrown);
    } finally {
      setWorking(null);
    }
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
      // Announced, because a dialog that never opens reads as a dead button
      // (the event or the session has usually gone).
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
      // The dialog stays open, so a 412 is read next to the event it is about.
      // That is why the confirm button is a plain Button, not Radix's
      // AlertDialogAction.
      destructive.setFromThrown(thrown);
    }
  }

  return (
    <PageSection>
      <div className="flex flex-wrap items-center justify-between gap-related">
        <h1 className="font-display text-3xl">{t("events.heading")}</h1>

        {mayManage ? (
          /* One menu trigger instead of two buttons, so it fits beside the
             heading on a phone and costs no row of its own (#182). Creating
             is a desk job, so the extra tap is cheap. RowActions is
             row-shaped, so this page-level menu does not use it.

             The items keep their full labels so each stands alone for a
             screen reader, and events.emptyHint quotes t("events.addSeries"),
             the same key rendered here. */
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" aria-label={t("events.addTriggerAria")}>
                <Plus aria-hidden="true" />
                {t("events.addTrigger")}
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* asChild straight to Link, never through ButtonLink: ButtonLink
                  does not spread unknown props, so Radix's Slot-merged role,
                  tabIndex and keyboard wiring would be dropped. See RowActions'
                  ItemFor. */}
              <DropdownMenuItem asChild>
                <Link to="/events/new">{t("events.add")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/events/new/series">{t("events.addSeries")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      <SeriesCreatedNotice />

      {publishing.error ? (
        <div role="alert" className="mt-related text-danger">
          <p>{publishing.error.message}</p>
          {publishing.error.fields.length > 0 ? (
            <ul className="mt-tight list-disc pl-5 text-sm">
              {publishing.error.fields.map((entry) => (
                <li key={entry.field}>{entry.message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-related flex flex-wrap items-center gap-tight">
        {/* Which half of the list, as a switch so the current view is
            announced. No guard on the incoming value: a radio group cannot be
            cleared, so `next` is always one of the two values below. */}
        <RadioGroup
          value={showingPast ? "past" : "planning"}
          orientation="horizontal"
          aria-label={t("events.viewSwitchAria")}
          onValueChange={(next: string) => setShowingPast(next === "past")}
        >
          <ToggleOption value="planning">{t("events.viewPlanning")}</ToggleOption>
          <ToggleOption value="past">{t("events.viewPast")}</ToggleOption>
        </RadioGroup>

        {/* Beside the switch, not on a row of its own: a row costs the first
            card 60px at 390px, the #182 phone budget that members.spec.ts
            guards (first card above y=300). The narrow width is why the
            placeholder is the short word and the full label stays the
            accessible name. */}
        <SearchField
          id="planning-search"
          label={t("events.searchLabel")}
          placeholder={t("events.searchPlaceholder")}
          value={typed}
          onChange={setTyped}
          className="min-w-40 flex-1 sm:max-w-72"
        />

        {/* md and up only: a month grid is for planning a season at a desk,
            and the list stays the default everywhere. */}
        {calendarEnabled ? (
          <Button
            type="button"
            variant="raised-light"
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

      <div className="mt-tight">
        <TagFilter tags={tagList} value={tag} onChange={setChosenTag} />
      </div>

      {calendarEnabled && showingCalendar ? (
        <div className="mt-block hidden md:block">
          <EventCalendar events={allEvents} selected={day} onSelect={setDay} />
        </div>
      ) : null}

      {/* Visible at every width, unlike the calendar that sets it, so a resize
          that hides the calendar cannot leave the list silently narrowed. */}
      {day !== null ? (
        <p className="mt-related flex flex-wrap items-center gap-tight text-sm">
          <span data-testid="day-filter" className="text-ink-muted">
            {t("events.dayFiltered")}
          </span>
          <Button type="button" variant="raised-light" size="sm" onClick={() => setDay(null)}>
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

      {/* The empty state says something, since a blank screen reads as
          broken. A search or tag that matched nothing gets its own sentence
          and no hint to add a series: the planning may be full. */}
      {!planning.isPending && !planning.isError && shown.length === 0 ? (
        <div className="mt-block">
          <p className="text-ink-muted">
            {q !== ""
              ? t("events.noMatch")
              : tag !== null
                ? t("events.noTagMatch")
                : showingPast
                  ? t("events.emptyPast")
                  : t("events.empty")}
          </p>
          {mayManage && !showingPast && q === "" && tag === null ? (
            <p className="mt-tight text-sm text-ink-muted">
              {/* The hint quotes the menu item from the key that renders it.
                  The guillemets travel in the string, because French spaces
                  them and German does not. */}
              {t("events.emptyHint", { action: t("events.addSeries") })}
            </p>
          ) : null}
        </div>
      ) : null}

      {drafts.length > 0 ? (
        <section className="mt-block" aria-labelledby="drafts-heading">
          <h2 id="drafts-heading" className="font-display text-xl">
            {t("events.draftsHeading")}
          </h2>
          <div className="mt-related grid gap-related">
            {drafts.map((draft) => card(draft, false))}
          </div>
        </section>
      ) : null}

      {awaiting.length > 0 ? (
        <section className="mt-block" aria-labelledby="awaiting-heading">
          <h2 id="awaiting-heading" className="font-display text-xl">
            {t("events.owedHeading")}
          </h2>

          {/* The count carries the to-do meaning. It sits beside the heading,
              not in it: the h2 names this region, and a number in it would
              rename the region on every answer. Both wordings fit one line at
              375px, so the last answer does not reflow the list. */}
          <p data-testid="owed-count" aria-live="polite" className="mt-tight text-ink-muted">
            {/* Zero is its own sentence, since neither French nor German has
                a `_zero` plural category. Above zero the catalogue decides,
                because German changes the verb too ("Es fehlt", "Es
                fehlen"). */}
            {missing === 0 ? t("events.allAnswered") : t("events.owedCount", { count: missing })}
          </p>

          <div className="mt-related grid gap-related">
            {awaiting.map((event) => card(event, true))}
          </div>
        </section>
      ) : null}

      {/* The heading is dropped in the upcoming view when no block above it
          needs telling apart, since a lone "Planning" under a page titled
          "Planning" costs a line of screen (#182). It always shows in the
          past view, where it says which half is on screen. It never shows
          over an empty list: this section and the empty message are
          siblings, so only `planned.length` stops a heading with nothing
          under it. The message reads `shown` and this reads `planned` on
          purpose, so a player owed an answer on everything gets neither. */}
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

      {/* No typed phrase for an event, unlike a member: typing a name back is
          for an action that destroys somebody's history. The dialog names the
          event and what goes with it, since the API deletes every attendance
          answer and public booking attached to it. */}
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

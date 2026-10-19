import { ButtonLink } from "@/components/ButtonLink";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useAgendaIndex } from "../api/generated/endpoints";
import { RAISED_CARD } from "../carnival/raised";
import type { PublicEventResource } from "../api/generated/model";
import { t } from "../i18n";
import { EventPoster } from "./EventPoster";
import { formatEventDay, formatEventWhen } from "./formatEventWhen";
import { TagChip } from "./TagChip";

/** How many appearances the front page shows before it sends people to /agenda. */
const SHOWN = 3;

/** The date badges take turns, so neighbouring cards do not look alike. */
export const BADGE_TINTS = ["bg-yellow", "bg-cyan", "bg-lime"];

/**
 * One appearance, as a stranger reads it.
 *
 * Not EventCard, which is typed on EventResource and renders the dress code,
 * the committee's notes and an answer slot. This has four fields, each one
 * already on a poster, and no caller who may see the rest.
 *
 * Callers key it on the event's id: two events can share a date, so the start
 * and the title together are only nearly unique.
 *
 * The booking link appears only while bookings are open, and
 * `registrationOpen` is the server's answer, not derived from a date here. An
 * event whose window has not opened is listed like any other, and a booking
 * link on it would lead to a form that refuses the reader.
 */
export function AgendaEntry({
  event,
  tint = "bg-yellow",
}: {
  event: PublicEventResource;
  /** The date badge's carnival colour, as a `bg-*` class. */
  tint?: string;
}) {
  const { day, month } = formatEventDay(event.startsAt);

  return (
    <li
      className={cn(
        RAISED_CARD,
        "grid grid-cols-[auto_minmax(0,1fr)] gap-4 p-4",
        event.poster && "md:grid-cols-[auto_minmax(0,1fr)_auto]",
      )}
    >
      {/* A picture of the date. The line under the title says the same thing
          in words, so a screen reader skips this. */}
      <div
        aria-hidden="true"
        className={`flex w-18 shrink-0 flex-col items-center self-start rounded-xl border-3 border-ink py-2 ${tint}`}
      >
        <span className="font-display text-3xl leading-none">{day}</span>
        <span className="mt-1 text-xs font-bold tracking-widest uppercase">{month}</span>
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-xl text-ink">{event.title}</h3>
        {event.tags.length > 0 ? (
          <div className="mt-tight flex flex-wrap gap-tight text-sm">
            {event.tags.map((tag) => (
              <TagChip key={tag.id} tag={tag} />
            ))}
          </div>
        ) : null}
        <p className="mt-tight text-sm text-ink-muted">
          {formatEventWhen(event.startsAt, event.endsAt)}
        </p>
        <p className="mt-tight text-sm text-ink-muted">{event.location}</p>

        {event.registrationOpen ? (
          <ButtonLink
            to={`/events/${event.id}/book`}
            variant="raised-violet"
            className="mt-related"
            ariaLabel={t("agenda.registerFor", { title: event.title })}
          >
            {t("agenda.register")}
          </ButtonLink>
        ) : null}
      </div>

      {event.poster ? (
        <EventPoster
          poster={event.poster}
          title={event.title}
          className="col-span-2 row-start-1 md:col-span-1 md:col-start-3"
        />
      ) : null}
    </li>
  );
}

/**
 * What the band is doing next, on the front page, or nothing at all.
 *
 * It renders nothing unless it has an event. Pending, refused and empty all
 * collapse into an empty list, so one guard covers all three. There is no
 * loading state and no error:
 *
 *   - "aucun événement" on a band's front page reads as "this band does
 *     nothing", which is worse than no section;
 *   - the visitor never asked for the schedule, so an error about it is noise;
 *   - this live dependency must never hold up the hero.
 *
 * /agenda is the opposite case: somebody who navigated there asked for the
 * schedule and is owed an answer either way. Hence two components over one
 * endpoint instead of one with a prop.
 *
 * Three, not all of them: a season of dates below the hero is a schedule, not
 * an invitation, and the rest are on /agenda.
 */
export function PublicAgenda() {
  const agenda = useAgendaIndex();
  const all = rowsOf<PublicEventResource>(agenda.data);
  const upcoming = all.slice(0, SHOWN);

  if (upcoming.length === 0) {
    return null;
  }

  return (
    <section className="mt-block" aria-labelledby="agenda-heading">
      <h2 id="agenda-heading" className="heading-wave w-fit font-display text-2xl md:text-3xl">
        {t("agenda.heading")}
      </h2>

      <ul className="mt-block grid gap-5 md:grid-cols-2">
        {upcoming.map((event, index) => (
          <AgendaEntry
            key={event.id}
            event={event}
            tint={BADGE_TINTS[index % BADGE_TINTS.length]}
          />
        ))}
      </ul>

      {/* Only when there is more to see; under a list that already holds
          every date it would lead to a page the reader has just read. */}
      {all.length > SHOWN ? (
        <ButtonLink to="/agenda" variant="raised-light" className="mt-block">
          {t("agenda.seeAll")}
        </ButtonLink>
      ) : null}
    </section>
  );
}

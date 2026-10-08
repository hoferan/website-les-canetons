import { ButtonLink } from "@/components/ButtonLink";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useAgendaIndex } from "../api/generated/endpoints";
import { RAISED_CARD } from "../carnival/raised";
import type { PublicEventResource } from "../api/generated/model";
import { t } from "../i18n";
import { formatEventDay, formatEventWhen } from "./formatEventWhen";
import { TagChip } from "./TagChip";

/** How many appearances the front page shows before it sends people to /agenda. */
const SHOWN = 3;

/** The date badges take turns, so neighbouring cards do not look alike. */
export const BADGE_TINTS = ["bg-yellow", "bg-cyan", "bg-lime"];

/**
 * One appearance, as a stranger reads it.
 *
 * NOT EventCard, which is typed on EventResource and renders the dress code,
 * the committee's notes and an answer slot. This has four fields, each one
 * already on a poster, and no caller who may see the rest.
 *
 * Keyed by its CALLER on the event's id, which the resource gained when the
 * booking form was built: two events do collide on a date here — the live
 * planning had two on 3 October — so the start and the title together were
 * only nearly unique.
 *
 * THE BOOKING LINK APPEARS ONLY WHILE BOOKINGS ARE OPEN, and `registrationOpen`
 * is the server's answer rather than anything derived from a date here. An
 * event whose window has not opened is on this list like any other; offering
 * "S'inscrire" on it would send a reader to a form that refuses them, which is
 * the same promise broken either way round.
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
    <li className={cn(RAISED_CARD, "flex gap-4 p-4")}>
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
    </li>
  );
}

/**
 * What the band is doing next, on the front page — or nothing at all.
 *
 * IT RENDERS NOTHING UNLESS IT HAS AN EVENT, AND THAT IS THE WHOLE DESIGN.
 * Pending, refused and empty all collapse into an empty list, so one guard
 * covers all three. There is deliberately no "Chargement…" and no error:
 *
 *   - a card saying "aucun événement" on a band's front page reads as "this
 *     band does nothing", which is worse than no section at all;
 *   - the visitor never asked for the schedule, so an error about it is noise
 *     on the page where noise is most visible;
 *   - this live dependency must never hold up the hero, and a component that
 *     can only add or add nothing cannot.
 *
 * /agenda IS THE OPPOSITE CASE, and says so in its own file: somebody who
 * navigated there asked for the schedule and is owed an answer either way.
 * That difference is why these are two components over one endpoint rather
 * than one component with a prop.
 *
 * THREE, NOT ALL OF THEM. A season of carnival dates below the hero is a
 * schedule rather than an invitation, and the rest of them have a page now.
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

      {/* Only when there is more to see. A "toutes les dates" button under a
          list that already IS all the dates sends somebody to a page they have
          just finished reading. */}
      {all.length > SHOWN ? (
        <ButtonLink to="/agenda" variant="raised-light" className="mt-block">
          {t("agenda.seeAll")}
        </ButtonLink>
      ) : null}
    </section>
  );
}

import { Card } from "@/components/ui/card";
import { formatEventDate, formatEventDateRange } from "@/lib/date";
import { cn } from "@/lib/utils";

/** Only what the card renders. Both pages pass a wider event object through. */
export type EventCardEvent = {
  date: string;
  title: string;
  weekend: number;
};

/**
 * One event, as a card: the date as the heading, the title under it, then
 * whatever the page wants in the body and the footer.
 *
 * SHARED BY /planning_repet AND /sinscrire on purpose. /sinscrire was a
 * three-column table squeezed into 390px -- every cell wrapping to three lines,
 * its action button 28px tall -- and rebuilding it as cards without this
 * component would mean a second, near-identical card tree to keep in step
 * forever. The two pages differ in their body and their footer, which is
 * exactly what `children` and `actions` are.
 *
 * THE ACTIONS ARE A FOOTER SLOT, NOT AN OVERLAY. /planning_repet's controls
 * were `absolute top-2 right-2`, which at 390px rendered the Modifier and
 * Supprimer buttons ON TOP of the event date -- the one thing the card exists to
 * tell you. Desktop was fine, which is why nothing caught it, and no unit or
 * e2e test could: both assert on roles and text, and the text was all present in
 * the DOM. It was only wrong on screen. A footer cannot overlap the heading at
 * any width, so the fix is structural rather than a spacing tweak.
 *
 * h3, because both pages already own an h1 and /inscriptions_admin an h2. A card
 * that emitted h2 would break the outline on one page and not the other, which
 * is why the level is asserted in the test rather than left to look right.
 */
export function EventCard({
  event,
  children,
  actions,
  className,
}: {
  event: EventCardEvent;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card asChild className={cn("gap-0 p-5 shadow-sm", className)}>
      <li>
        <h3 className="font-bold">
          {event.weekend ? formatEventDateRange(event.date) : formatEventDate(event.date)}
        </h3>
        <p className="mt-1 font-display text-lg">{event.title}</p>

        {children ? <div className="mt-3 text-ink-muted">{children}</div> : null}

        {actions ? (
          <div data-event-actions className="mt-4 flex flex-wrap gap-2">
            {actions}
          </div>
        ) : null}
      </li>
    </Card>
  );
}

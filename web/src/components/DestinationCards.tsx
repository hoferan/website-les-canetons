import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";

export type Destination = {
  to: string;
  title: string;
  description: string;
  /** Decoration only: the label already says where the card goes. */
  icon: LucideIcon;
  /** A carnival colour behind the icon, as a `bg-*` class. */
  tint: string;
};

/**
 * A short grid of link cards pointing somewhere else on the site.
 *
 * IT MUST NEVER BE GENERATED FROM `NAV`. On the front page these cards
 * deliberately duplicate part of the navigation: the nav is the list of every
 * page and is the source of truth for what EXISTS, while this is a curated
 * shortlist of what a stranger most likely wants first. If the two drift, the
 * nav is right about existence and this is still right about priority.
 * Deriving one from the other collapses that distinction and turns the front
 * door back into a second navigation.
 *
 * The WHOLE CARD is the link, not a "read more" inside it: 44px is the floor
 * for every interactive control on this site, and a card-sized target is
 * easier still on a phone. The description sits inside the anchor so the
 * accessible name says where the link goes and why, rather than repeating the
 * nav's own label.
 *
 * `focus-ring` because the card has no other focus affordance — it is a <div>
 * turned into an <a>, and `focus-ring` is what this codebase uses in place of
 * the browser default everywhere else.
 *
 * `Card asChild` makes the card BE the anchor — Radix `Slot.Root` clones its
 * props onto the single child element, so there is exactly one rendered
 * element carrying both class strings, not a card wrapping a separate anchor.
 * `h-full` is what fills the stretched grid item, which is what stops a
 * shorter card floating with a ragged bottom edge beside a taller one.
 *
 * Trap: `Slot` merges `className` by string-concatenating the parent's and the
 * child's, NOT by tailwind-merge. A `display` utility passed to the child
 * therefore does not override the `Card` base's `flex flex-col`; it sits in
 * the class list unused. Passing one here would be silently dead — don't.
 *
 * `label` IS A VISIBLE HEADING, NOT A HIDDEN NAME. It used to be only an
 * `aria-label` on the `<ul>` — a name a screen reader announced and a sighted
 * visitor never saw. Screenshotted at 390x844 and 1280x900, that made the
 * cards read as a continuation of the section above them: same white,
 * rounded, bordered shape, no heading of their own, and a gap above them only
 * twice the gap between them. A sighted visitor saw one heading over five
 * cards; a screen-reader user heard a properly named second list. The two
 * trees disagreed, and the accessibility tree was the only one that was right.
 *
 * THE RAISED, TILTED LOOK IS ADR 0029's, and it is for a coloured band: the
 * caller puts this on yellow. The tilt alternates per card, and it is on the
 * <li> rather than the card so the focus ring tilts with what it outlines.
 * `rounded-[20px]` and `border-3` override the Card base through tailwind-merge,
 * which `cn()` in Card applies to its own className prop.
 */
export function DestinationCards({
  label,
  destinations,
}: {
  label: string;
  destinations: Destination[];
}) {
  const headingId = useId();

  return (
    <section>
      <h2
        id={headingId}
        data-confetti-avoid
        className="heading-wave w-fit font-display text-2xl md:text-3xl"
      >
        {label}
      </h2>

      <ul aria-labelledby={headingId} className="mt-block grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {destinations.map(({ to, title, description, icon: Icon, tint }) => (
          <li key={to} className="odd:-rotate-[1.2deg] even:rotate-1" data-confetti-avoid>
            <Card
              asChild
              className="h-full gap-3 rounded-[20px] border-3 border-ink p-4 shadow-raised transition-transform hover:-translate-y-0.5"
            >
              <Link to={to} className="focus-ring">
                <span
                  className={`grid size-13 place-items-center rounded-[14px] border-3 border-ink ${tint}`}
                >
                  <Icon aria-hidden="true" className="size-7" strokeWidth={2.25} />
                </span>
                <span className="font-display text-xl text-ink uppercase">{title}</span>
                <span className="block text-ink-muted">{description}</span>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
 * Never generate it from the nav. The nav is the source of truth for what
 * exists; this is a curated shortlist of what a stranger most likely wants
 * first. Deriving one from the other turns the front door into a second
 * navigation.
 *
 * The whole card is the link, a target easier than 44px on a phone. The
 * description sits inside the anchor so the accessible name says where the
 * link goes and why. `focus-ring` because the card has no other focus
 * affordance.
 *
 * `Card asChild` makes the card be the anchor: one rendered element carrying
 * both class strings. `h-full` fills the stretched grid item, so cards in a
 * row share a bottom edge.
 *
 * Trap: `Slot` merges `className` by concatenation, not tailwind-merge, so a
 * `display` utility on the child does not override the Card base's
 * `flex flex-col`. It would be silently dead.
 *
 * `label` is a visible heading, so sighted visitors and screen-reader users
 * both see these cards as their own section.
 *
 * The raised, tilted look is ADR 0029's, for a coloured band (the caller puts
 * this on yellow). The tilt is on the <li> so the focus ring tilts with what
 * it outlines. `rounded-[20px]` and `border-3` override the Card base through
 * the tailwind-merge that `cn()` in Card applies to its own className prop.
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

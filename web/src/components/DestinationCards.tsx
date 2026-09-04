import { useId } from "react";
import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";

export type Destination = { to: string; title: string; description: string };

/**
 * A short grid of link cards pointing somewhere else on the site.
 *
 * Its one caller today is /accueil. It was extracted on 2026-09-03 from the
 * tree /admin used to carry, back when that page duplicated /accueil's own
 * card grid; /admin is gone now, but the extraction is not wasted — it is
 * what made the two trees stop needing to be kept in step, and the component
 * stays well-factored and tested on its own.
 *
 * IT MUST NEVER BE GENERATED FROM `NAV`. On /accueil these four cards
 * deliberately duplicate four of the navigation's ten entries: the nav is the
 * list of every page and is the source of truth for what EXISTS, while this is
 * a curated shortlist of what a stranger most likely wants first. If the two
 * drift, the nav is right about existence and this is still right about
 * priority. Deriving one from the other collapses that distinction and turns
 * the front door back into a second navigation.
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
 * `h-full` on the `Card` is what fills the stretched grid item (the `<li>` is
 * the grid cell and stretches to the row height, so the anchor's
 * `height: 100%` resolves against that); that is what stops a shorter card
 * floating with a ragged bottom edge when it sits beside a taller one in the
 * same row.
 *
 * Trap: `Slot` merges `className` by string-concatenating the parent's and the
 * child's — `[slot, child].filter(Boolean).join(" ")` — NOT by tailwind-merge.
 * A `display` utility passed to the child therefore does not override the
 * `Card` base's `flex flex-col`; it just sits in the class list, unused, and
 * the emitted CSS's own rule order (`.block` before `.flex`) means `flex`
 * would win even if the two were literally in conflict. Passing one here
 * would be silently dead — don't.
 *
 * `label` IS A VISIBLE HEADING, NOT A HIDDEN NAME. It used to be only an
 * `aria-label` on the `<ul>` — a name a screen reader announced and a sighted
 * visitor never saw. Screenshotted at 390x844 and 1280x900 on /accueil, that
 * made the four cards read as a continuation of `NextEvent`'s "Prochain
 * événement" section above them: same white, rounded, bordered card shape, no
 * heading of their own, and a 24px gap above them that is only twice the 12px
 * gap between them. A sighted visitor saw one heading over five cards; a
 * screen-reader user heard a properly named second list. The two trees
 * disagreed, and the accessibility tree was the only one that was right.
 *
 * THE `mt-block` / `h2` / `mt-related` RHYTHM DELIBERATELY MATCHES `NextEvent.tsx`. That
 * is what makes "Prochain événement" and this `label` read as two peer
 * sections instead of one section and an afterthought — same section-level
 * gap above, same heading treatment, same gap from heading to list.
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
    <section className="mt-block">
      <h2 id={headingId} className="font-display text-2xl">
        {label}
      </h2>

      <ul aria-labelledby={headingId} className="mt-related grid gap-3 sm:grid-cols-2">
        {destinations.map((destination) => (
          <li key={destination.to}>
            <Card asChild className="h-full gap-0 p-5 transition-colors hover:border-violet">
              <Link to={destination.to} className="focus-ring">
                <span className="font-display text-xl text-violet">{destination.title}</span>
                <span className="mt-tight block text-ink-muted">{destination.description}</span>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

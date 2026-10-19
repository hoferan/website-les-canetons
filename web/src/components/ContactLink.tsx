import { cn } from "@/lib/utils";

import { mailtoHref, telHref } from "../lib/contactHref";

/**
 * Link styling, in one string.
 *
 * The underline carries the affordance. Against the surrounding
 * `text-ink-muted`, `--color-violet` is 1.13:1, far below the 3:1 WCAG 1.4.1
 * asks before colour alone may mark a link.
 *
 * `text-ink` so the actionable lines are the dark ones and the inert ones (the
 * address, the table name) stay muted. This is the members'-area idiom; the
 * public-prose one (`text-violet hover:underline`) suits a sentence holding
 * one link, not a long list.
 *
 * `inline-flex items-center` is what makes the 32px touch target exist:
 * `min-height` does not apply to an inline box, so without it `min-h-8` does
 * nothing. jsdom computes no layout, so only the 390px screenshot shows this.
 */
const LINK =
  "focus-ring rounded-sm inline-flex min-h-8 items-center py-1 break-words " +
  "text-ink underline underline-offset-2 hover:text-violet";

/**
 * One contact detail: a link when it can safely be one, the stored text when
 * it cannot.
 *
 * One component for both kinds, because the fallback (the stored value as
 * text, in the same place) is identical for both and a second copy would
 * drift.
 *
 * The accessible name is the value, with no `aria-label`. An override such as
 * "Écrire à Jean Dupont" over a visible `jean@example.ch` fails WCAG 2.5.3
 * Label in Name, and a Voice Control user saying "click jean@example.ch"
 * would match nothing. Link purpose comes from context (2.4.4): the card leads
 * with the guest's name.
 *
 * The fallback gets no touch-target classes: WCAG 2.5.8 applies to pointer
 * targets, and static text is not one. Its missing underline tells a reader it
 * is not tappable.
 *
 * `e164` is the API's reading of a phone number (#129) and wins over telHref()
 * when present: it has dropped a `(0)` trunk prefix and resolved the country,
 * which a link built from free text cannot. The text shown is still the
 * number as the guest typed it.
 */
export function ContactLink({
  kind,
  value,
  e164 = null,
  className,
}: {
  kind: "email" | "phone";
  value: string;
  e164?: string | null;
  className?: string;
}) {
  // An empty optional field would otherwise leave an empty flex child and its
  // gap behind, so the row grows for a fact nobody stored.
  if (value.trim() === "") {
    return null;
  }

  const href =
    kind === "email" ? mailtoHref(value) : e164 !== null ? `tel:${e164}` : telHref(value);

  if (href === null) {
    return <span className={className}>{value}</span>;
  }

  return (
    <a href={href} className={cn(LINK, className)}>
      {value}
    </a>
  );
}

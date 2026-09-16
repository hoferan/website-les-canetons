import { cn } from "@/lib/utils";

import { mailtoHref, telHref } from "../lib/contactHref";

/**
 * Link styling, one string for both layouts.
 *
 * THE UNDERLINE IS NOT OPTIONAL. These links sit in `text-ink-muted`
 * (`#5a5768`) text, and `--color-violet` (`#4b2ed6`) against it is 1.13:1 —
 * nowhere near the 3:1 WCAG 1.4.1 wants before colour alone may distinguish a
 * link from the prose around it. No saturation fixes that, so the underline is
 * what carries the affordance and the colour is decoration.
 *
 * `text-ink` RATHER THAN `text-ink-muted`, which also encodes something true
 * about this screen: the actionable lines are the dark ones and the inert ones
 * — the address, the table name — stay muted. It is the members'-area idiom
 * (`EventSeriesNew.tsx:77`) rather than the public-prose one
 * (`text-violet hover:underline`, `Committee.tsx:44`), which belongs to a
 * sentence holding one link and not to a list holding a hundred and sixty.
 *
 * `inline-flex items-center` IS LOAD-BEARING, not decoration. `min-height`
 * does not apply to a non-replaced inline box, so `min-h-8` on a default `<a>`
 * is a no-op and `py-1` paints padding without changing the line box. Omit the
 * `inline-flex` and the 32px touch target silently does not exist — and no
 * test at this layer can see it, because jsdom computes no layout. Check the
 * 390px screenshot, not the suite.
 */
const LINK =
  "focus-ring rounded-sm inline-flex min-h-8 items-center py-1 break-words " +
  "text-ink underline underline-offset-2 hover:text-violet";

/**
 * One contact detail: a link when it can safely be one, the stored text when
 * it cannot.
 *
 * ONE COMPONENT WITH A DISCRIMINATOR, not `EmailLink` + `PhoneLink`. Two
 * components would read marginally better at the four call sites and that is
 * all they would win. The fallback — render the stored value as text, in the
 * same place, when it cannot be linked — IS the component, it is identical for
 * both kinds, and a second copy is a second thing to drift. A pair of
 * hand-maintained copies drifting apart is the exact bug that produced the
 * missing address column this issue also fixes.
 *
 * THE ACCESSIBLE NAME IS THE VALUE, and there is deliberately no `aria-label`.
 * An override such as "Écrire à Jean Dupont" over a visible
 * `jean@example.ch` fails WCAG 2.5.3 Label in Name, and breaks speech input
 * concretely: a Voice Control user saying "click jean@example.ch" would match
 * nothing. Link purpose is satisfied in context (2.4.4) — the table supplies
 * the Contact column header per cell, the card leads with the guest's name.
 * This is the opposite call from `Members.tsx:490-501` and deliberately so: a
 * bare "Supprimer" carries nothing without a name, an address carries
 * everything.
 *
 * THE FALLBACK GETS NO TOUCH-TARGET CLASSES. WCAG 2.5.8's 24x24 minimum is a
 * requirement on a POINTER TARGET, and static text is not one. Its lack of an
 * underline is what tells a reader it is not tappable, which is 1.4.1 working
 * in the other direction.
 */
export function ContactLink({
  kind,
  value,
  className,
}: {
  kind: "email" | "phone";
  value: string;
  className?: string;
}) {
  // An empty optional field would otherwise leave an empty flex child and its
  // gap behind, so the row grows for a fact nobody stored.
  if (value.trim() === "") {
    return null;
  }

  const href = kind === "email" ? mailtoHref(value) : telHref(value);

  if (href === null) {
    return <span className={className}>{value}</span>;
  }

  return (
    <a href={href} className={cn(LINK, className)}>
      {value}
    </a>
  );
}

import { cn } from "@/lib/utils";

import { iconFor } from "./entry";

/**
 * An entry's icon tile, as every card on the site has one: pink for an
 * important entry, yellow otherwise, holding the entry's icon or, without
 * one, a plain dot, so every card's year starts in the same place.
 *
 * Decorative (`aria-hidden`); importance reaches a screen reader as text in
 * the entry's heading. The page and the form's preview both draw it here, so
 * the preview is the tile the page will show.
 */
export function EntryTile({
  important,
  icon,
  className,
}: {
  important: boolean;
  icon: string | null;
  className?: string;
}) {
  const Icon = iconFor(icon);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl border-3 border-ink",
        important ? "bg-pink" : "bg-yellow",
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-6" strokeWidth={2.25} />
      ) : (
        <span className="size-2.5 rounded-full bg-ink" />
      )}
    </span>
  );
}

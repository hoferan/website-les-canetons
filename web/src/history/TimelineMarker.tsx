import { iconFor } from "./entry";

/**
 * An entry's circle on the timeline: a large pink circle for an important
 * entry, a violet circle around an icon, or a plain violet dot.
 *
 * Decorative (`aria-hidden`); importance reaches a screen reader as text in
 * the entry's heading. The timeline and the form's preview both draw it here,
 * so the preview is the circle the page will show.
 */
export function TimelineMarker({
  important,
  icon,
  className = "",
}: {
  important: boolean;
  icon: string | null;
  className?: string;
}) {
  const Icon = iconFor(icon);
  const shape = important
    ? "size-10 bg-pink text-ink"
    : Icon
      ? "size-8 bg-violet text-white"
      : "size-4 bg-violet";

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full border-4 border-ground ${shape} ${className}`}
    >
      {Icon ? <Icon className={important ? "size-5" : "size-4"} /> : null}
    </span>
  );
}

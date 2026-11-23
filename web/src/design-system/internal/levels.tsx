import { Check, createLucideIcon, X, type LucideIcon } from "lucide-react";

import { cn } from "./cn";

/**
 * The four levels of ADR 0042, which the toast and the inline notice share so
 * that a level means the same thing in both places: the same icon, on the
 * same white disc, in front of the same column colour.
 */
export type Level = "success" | "info" | "warning" | "error";

// The info and warning glyphs without lucide's circle or triangle, because
// the disc around them is the frame. The dot sits a stroke's width off the
// stem, or at strokeWidth 3 the two run together into a bar.
const InfoGlyph = createLucideIcon("level-info", [
  ["path", { d: "M12 18v-6", key: "stem" }],
  ["path", { d: "M12 6.5h.01", key: "dot" }],
]);
const WarningGlyph = createLucideIcon("level-warning", [
  ["path", { d: "M12 6v7", key: "stem" }],
  ["path", { d: "M12 18h.01", key: "dot" }],
]);

/**
 * Each level's icon, its column colour, and the tint a toast's clock leaves
 * behind. The tint is the colour over the white body, so the icon keeps its
 * ink contrast at every height.
 */
export const LEVELS: Record<Level, { icon: LucideIcon; fill: string; tint: string }> = {
  success: { icon: Check, fill: "bg-lime", tint: "bg-lime/28" },
  info: { icon: InfoGlyph, fill: "bg-cyan", tint: "bg-cyan/28" },
  warning: { icon: WarningGlyph, fill: "bg-yellow", tint: "bg-yellow/28" },
  error: { icon: X, fill: "bg-danger", tint: "bg-danger/28" },
};

/**
 * The level's icon on a white disc with an ink outline. The toast takes the
 * large one; the notice, flat in the page, the small one.
 */
export function LevelDisc({ level, size }: { level: Level; size: "sm" | "lg" }) {
  const Icon = LEVELS[level].icon;
  return (
    <span
      data-level-icon={level}
      className={cn(
        "relative grid place-items-center rounded-full border-ink bg-panel",
        size === "lg" ? "size-9.5 border-3" : "size-8 border-2",
      )}
    >
      <Icon aria-hidden="true" className={size === "lg" ? "size-5" : "size-4"} strokeWidth={3} />
    </span>
  );
}

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import type { EventTagResource } from "../api/generated/model";
import { t, tagLabel } from "../i18n";
import { TAG_COLOURS } from "./tagColours";

const ALL = "all";

/**
 * The tag the planning is narrowed to, or null for all of it.
 *
 * A tag deleted while it was chosen reads as null, so the planning falls back
 * to everything rather than asking the server for a tag it no longer has and
 * showing an empty list nobody can explain.
 */
export function shownTag(
  chosen: number | null,
  tags: readonly Pick<EventTagResource, "id">[],
): number | null {
  return chosen !== null && tags.some((tag) => tag.id === chosen) ? chosen : null;
}

/**
 * One row of chips that narrows the planning to a tag (#107).
 *
 * A radio group for the reason ui/radio-group.tsx gives: one choice, arrow
 * keys that select, and no way to be left with nothing chosen. Built on the
 * primitive rather than on ToggleOption because each option looks like the
 * chip it filters by, not like a segment.
 *
 * ONE ROW THAT SCROLLS SIDEWAYS on a phone instead of wrapping. Wrapped, four
 * tags and "Tous" take two rows at 390px, and the planning's first card is
 * held to a height budget (web/e2e/members.spec.ts).
 */
export function TagFilter({
  tags,
  value,
  onChange,
}: {
  tags: EventTagResource[];
  value: number | null;
  onChange: (tag: number | null) => void;
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <RadioGroupPrimitive.Root
      aria-label={t("events.tagFilterAria")}
      orientation="horizontal"
      value={value === null ? ALL : String(value)}
      onValueChange={(next: string) => onChange(next === ALL ? null : Number(next))}
      className="-mx-1 flex gap-1 overflow-x-auto px-1"
    >
      <Option
        value={ALL}
        className="border border-line bg-panel text-ink group-data-[state=checked]:border-ink group-data-[state=checked]:bg-ink group-data-[state=checked]:text-white"
      >
        {t("events.tagAll")}
      </Option>
      {tags.map((tag) => (
        <Option
          key={tag.id}
          value={String(tag.id)}
          className={`${TAG_COLOURS[tag.colour]} border border-transparent group-data-[state=checked]:border-current`}
        >
          {tagLabel(tag)}
        </Option>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/**
 * A 44px-tall hit area around a chip-sized pill: the touch floor every control
 * here keeps (ui/button.tsx), without making the pill itself 44px tall.
 *
 * Radix sets `data-state` on the item, not on the pill inside it, so the
 * pill's checked look has to use `group-data-[state=checked]:`. A plain
 * `data-[state=checked]:` there matches nothing and the chosen chip looks
 * like every other.
 */
function Option({
  value,
  className,
  children,
}: {
  value: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      className="group inline-flex min-h-touch shrink-0 items-center outline-none"
    >
      <span
        className={`rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50 ${className}`}
      >
        {children}
      </span>
    </RadioGroupPrimitive.Item>
  );
}

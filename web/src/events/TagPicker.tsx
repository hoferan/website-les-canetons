import { Check } from "lucide-react";

import { rowsOf } from "../api/collection";
import { useEventTagIndex } from "../api/generated/endpoints";
import type { EventTagResource } from "../api/generated/model";
import { t, tagLabel } from "../i18n";
import { TAG_COLOURS } from "./tagColours";

/**
 * Picks an event's tags in its form (#107): the same chips the card shows,
 * each a toggle button.
 *
 * Toggle buttons in a fieldset, not checkboxes: a ticked box beside a chip
 * would show the choice twice. `aria-pressed` carries it for a screen reader,
 * and a dark border and a check carry it on screen; the border is the mark
 * the planning's filter uses for its chosen tag.
 *
 * Renders nothing until the band has a tag, so a form never shows an empty
 * group with a heading over nothing.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (tagIds: number[]) => void;
}) {
  const tags = rowsOf<EventTagResource>(useEventTagIndex().data);

  if (tags.length === 0) {
    return null;
  }

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((chosen) => chosen !== id) : [...value, id]);

  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink">{t("eventForm.tags")}</legend>
      <div className="mt-tight flex flex-wrap gap-1">
        {tags.map((tag) => {
          const pressed = value.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(tag.id)}
              className="group inline-flex min-h-touch items-center outline-none"
            >
              {/* No dimming of the unchosen chips: opacity took their text
                  under 4.5:1 (axe, in both forms). The border and the check
                  carry the choice instead, and the check says only that. */}
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium group-focus-visible:ring-[3px] group-focus-visible:ring-ring/50 ${TAG_COLOURS[tag.colour]} ${
                  pressed ? "border-current" : "border-transparent"
                }`}
              >
                {pressed ? <Check aria-hidden="true" className="size-3.5" /> : null}
                {tagLabel(tag)}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

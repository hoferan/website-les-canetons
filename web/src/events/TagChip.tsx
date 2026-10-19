import type { EventTagResource } from "../api/generated/model";
import { tagLabel } from "../i18n";
import { TAG_COLOURS } from "./tagColours";

/**
 * One event tag as a tinted pill.
 *
 * `break-words` rather than `whitespace-nowrap`, as a backstop. A name at the
 * API's 40-character cap fits on one line on a 320px phone
 * (web/e2e/tags.spec.ts), but a chip that cannot wrap would widen its card
 * past the screen edge if it ever ran longer.
 */
export function TagChip({
  tag,
}: {
  tag: Pick<EventTagResource, "labelFr" | "labelDe" | "colour">;
}) {
  return (
    <span className={`rounded-full px-2 py-0.5 break-words ${TAG_COLOURS[tag.colour]}`}>
      {tagLabel(tag)}
    </span>
  );
}

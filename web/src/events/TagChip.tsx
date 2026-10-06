import type { EventTagResource } from "../api/generated/model";
import { tagLabel } from "../i18n";
import { TAG_COLOURS } from "./tagColours";

/**
 * One event tag as a tinted pill (#107).
 *
 * `break-words` rather than `whitespace-nowrap`, as a backstop. A name at the
 * API's 40-character cap fits on one line even on a 320px phone (measured,
 * web/e2e/tags.spec.ts), but a chip that cannot wrap widens its card past
 * the screen edge if it ever runs longer, the way #89 did.
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

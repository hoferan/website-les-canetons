import type { EventTagResource } from "../api/generated/model";
import { tagLabel } from "../i18n";
import { TAG_COLOURS } from "./tagColours";

/**
 * One event tag as a tinted pill (#107).
 *
 * `break-words` rather than `whitespace-nowrap`: a 40-character name has to
 * wrap inside a 390px card, or it widens the card and drags the page sideways
 * the way #89 did.
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

import { Badge } from "@ds";

import type { EventTagResource } from "../api/generated/model";
import { tagLabel } from "../i18n";

/**
 * One event tag as a tinted Badge.
 *
 * A Badge does not wrap. A name at the API's 40-character cap still fits on
 * one line on a 320px phone (web/e2e/tags.spec.ts).
 */
export function TagChip({
  tag,
}: {
  tag: Pick<EventTagResource, "labelFr" | "labelDe" | "colour">;
}) {
  return (
    <Badge tone="tag" tint={tag.colour}>
      {tagLabel(tag)}
    </Badge>
  );
}

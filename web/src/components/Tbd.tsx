import { useShowsGaps } from "../content/EditMode";
import { t } from "../i18n";

/**
 * A placeholder for content the band has not yet supplied, shown to an
 * editor in edit mode and to nobody else (ADR 0048).
 *
 * A stale name is worse than a gap: a parent who rings the wrong person gets
 * a wrong answer. So a fact the band has not confirmed is never guessed. A
 * visitor reads nothing in its place, since a placeholder reads to them as an
 * unfinished site (#393); the editor reads this, which no one can mistake for
 * real content. Some come from a content block's default: a phone row that
 * ships with an empty number renders this until the Direction types one into
 * the block's editor (ADR 0038). The others stand in for what the roster does
 * not hold yet. What is still missing is counted by rendering the public
 * pages in edit mode: a grep over call sites miscounts, because some sit in a
 * loop and others render only for an empty roster.
 *
 * Renders nothing outside edit mode, so no caller can leak one to a visitor.
 * A caller that wraps it in an element of its own asks `useShowsGaps()` too,
 * and drops the wrapper.
 *
 * `what` is an already-translated string, never a fragment glued together
 * outside the catalogue. A caller resolves its own
 * `placeholders.*` key with `t()`; this component supplies only the leading
 * marker and wording from `placeholders.tbd`.
 *
 * `token` is a stable English identifier for what is missing, carried on
 * `data-tbd` so it does not change per locale.
 *
 * `onMembersPage` says the gap is filled on the members page, for what comes
 * from the roster and has no edit chip of its own.
 */
export function Tbd({
  what,
  token,
  onMembersPage = false,
}: {
  what?: string;
  token?: string;
  onMembersPage?: boolean;
}) {
  if (!useShowsGaps()) {
    return null;
  }
  return (
    <span
      // Italic and muted so it reads as unfinished rather than broken, with a
      // dotted underline so it is still obvious in a screenshot or in print,
      // where colour alone may not survive.
      className="text-ink-muted italic underline decoration-dotted"
      // Announced as written: a screen-reader user needs to know the field is
      // blank for everyone, not that their software failed to read a name.
      data-tbd={token ?? ""}
    >
      {what
        ? t(onMembersPage ? "placeholders.tbdOnMembersPage" : "placeholders.tbdWhat", { what })
        : t("placeholders.tbd")}
    </span>
  );
}

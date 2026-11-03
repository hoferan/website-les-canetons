import { t } from "../i18n";

/**
 * A visible placeholder for content the band has not yet confirmed.
 *
 * A stale name is worse than an obvious gap: a parent who rings the wrong
 * person gets a wrong answer, whereas a parent who sees a gap asks. So facts
 * the band has not confirmed render as something no reader can mistake for
 * real content. The Direction fills each one in from the page, in edit mode
 * (ADR 0038); what is still missing is counted by rendering
 * the public pages: a grep over call sites miscounts, because some sit in a
 * loop and others render only for an empty roster.
 *
 * None may remain before PROD. TEST and QA are behind HTTP Basic Auth, so only
 * the band sees placeholders there; PROD is public.
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

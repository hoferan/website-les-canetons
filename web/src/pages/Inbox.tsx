import { Link } from "react-router-dom";

import { rowsOf } from "../api/collection";
import { useInboxIndex } from "../api/generated/endpoints";
import type { InboxItemResource } from "../api/generated/model";
import { PageSection } from "../components/PageSection";
import { t } from "../i18n";
import { formatInstant } from "../lib/date";

/**
 * The `kind` tokens this screen knows how to name.
 *
 * NOT A MODULE-SCOPE SNAPSHOT OF THE FRENCH CATALOGUE ANY MORE. This was
 * `Record<string, string>` assigned from the French object, evaluated at
 * import and frozen there, so `/de/inbox` labelled every row "Message du
 * site" however the page was reached. It is also why this file imported the
 * French catalogue at all — see the guard in
 * web/src/i18n/catalogues.test.ts, which now forbids that anywhere outside
 * i18n/.
 *
 * Listed rather than derived so the template literal below stays a valid
 * `TranslationKey`: an unconstrained key built from a wire token would not
 * typecheck, and widening the key type to make it typecheck would give up the
 * typo-catching that signature exists for. #123 adds a source; it adds a
 * member here and a key in both catalogues.
 */
const KINDS = ["contactMessage"] as const;

/** `kind` is a machine token (`contactMessage`) — never render it verbatim. */
function kindLabel(kind: string): string {
  return (KINDS as readonly string[]).includes(kind)
    ? t(`inbox.kinds.${kind as (typeof KINDS)[number]}`)
    : kind;
}

/**
 * The worklist: everything still open, across every source, newest first —
 * exactly the order `GET /inbox` answers in, so this reads the list straight
 * through with no re-sort of its own.
 *
 * ONE FLAT LIST, NOT GROUPED BY KIND. There is exactly one kind today
 * (`contactMessage`); grouping headers for a single group would be chrome
 * with nothing to organise. Each row still names its kind in French, so a
 * second source arriving later reads as a worklist of two kinds rather than
 * an unexplained mix.
 *
 * EVERY ROW LINKS TO `item.path` — where the work actually gets done. This
 * screen is a way THROUGH to that place, not a second place to do it; for
 * `contactMessage` that is `/contact-messages?open=<id>`, which opens the
 * message ready to read rather than making its reader find it again.
 *
 * Reads through `rowsOf()`, never a bare `.data.data`. The summary the nav
 * badge reads is a *different* endpoint (`GET /inbox/summary`) and is NOT a
 * list — see Layout.tsx, which reads it directly with no envelope hop.
 */
export function Inbox() {
  const list = useInboxIndex();
  const items = rowsOf<InboxItemResource>(list.data);

  return (
    <PageSection>
      <h1 className="font-display text-4xl">{t("inbox.heading")}</h1>

      {list.isPending ? <p className="mt-block">{t("common.loading")}</p> : null}
      {list.isError ? (
        <p role="alert" className="mt-block text-danger">
          {t("inbox.loadError")}
        </p>
      ) : null}

      {!list.isPending && !list.isError && items.length === 0 ? (
        <p className="mt-block text-ink-muted">{t("inbox.empty")}</p>
      ) : null}

      {!list.isPending && !list.isError && items.length > 0 ? (
        <ul data-testid="inbox-items" className="mt-block flex flex-col gap-related">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} data-testid="inbox-item">
              <Link
                to={item.path}
                className="focus-ring block rounded-md border border-line bg-panel p-4 hover:border-violet"
              >
                <p className="text-sm text-ink-muted">{kindLabel(item.kind)}</p>
                <p data-testid="inbox-item-title" className="font-semibold">
                  {item.title}
                </p>
                <p className="mt-tight text-sm">{item.summary}</p>
                <p className="mt-tight text-sm text-ink-muted">{formatInstant(item.arrivedAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </PageSection>
  );
}

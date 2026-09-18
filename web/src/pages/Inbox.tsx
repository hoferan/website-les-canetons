import { Link } from "react-router-dom";

import { rowsOf } from "../api/collection";
import { useInboxIndex } from "../api/generated/endpoints";
import type { InboxItemResource } from "../api/generated/model";
import { PageSection } from "../components/PageSection";
import { fr } from "../i18n/fr";
import { formatInstant } from "../lib/date";

// `fr.inbox.kinds` is typed to its own literal keys, not a general
// dictionary — this is the one place a `kind` off the wire is used to index
// it, so the cast lives here rather than loosening the source of truth in
// fr.ts.
const KIND_LABELS: Record<string, string> = fr.inbox.kinds;

/** `kind` is a machine token (`contactMessage`) — never render it verbatim. */
function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
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
      <h1 className="font-display text-4xl">{fr.inbox.heading}</h1>

      {list.isPending ? <p className="mt-block">Chargement…</p> : null}
      {list.isError ? (
        <p role="alert" className="mt-block text-danger">
          {fr.inbox.loadError}
        </p>
      ) : null}

      {!list.isPending && !list.isError && items.length === 0 ? (
        <p className="mt-block text-ink-muted">{fr.inbox.empty}</p>
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

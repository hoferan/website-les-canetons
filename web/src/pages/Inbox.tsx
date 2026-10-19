import { Link } from "react-router-dom";

import { rowsOf } from "../api/collection";
import { useInboxIndex } from "../api/generated/endpoints";
import type { InboxItemResource } from "../api/generated/model";
import { PageSection } from "../components/PageSection";
import { t } from "../i18n";
import { formatInstant } from "../lib/date";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * The `kind` tokens this screen knows how to name.
 *
 * Listed rather than derived so the template literal below stays a valid
 * `TranslationKey`: a key built from an unconstrained wire token would not
 * typecheck, and widening the key type would give up its typo-catching. A new
 * source adds a member here and a key in both catalogues.
 */
const KINDS = ["contactMessage"] as const;

/** `kind` is a machine token (`contactMessage`), never rendered verbatim. */
function kindLabel(kind: string): string {
  return (KINDS as readonly string[]).includes(kind)
    ? t(`inbox.kinds.${kind as (typeof KINDS)[number]}`)
    : kind;
}

/**
 * The worklist: everything still open, across every source, newest first.
 * That is the order `GET /inbox` answers in, so there is no re-sort here.
 *
 * One flat list, not grouped by kind: with a single kind, group headers would
 * organise nothing. Each row still names its kind, so a second source reads
 * as a worklist of two kinds rather than an unexplained mix.
 *
 * Every row links to `item.path`, where the work gets done; for
 * `contactMessage` that is `/contact-messages?open=<id>`, which opens the
 * message ready to read.
 *
 * The nav badge reads a different endpoint (`GET /inbox/summary`), which is
 * not a list; see Layout.tsx.
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
                className={`${OUTLINED_CARD} focus-ring block p-4 hover:border-violet`}
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

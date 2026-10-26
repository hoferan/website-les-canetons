import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { rowsOf } from "../api/collection";
import {
  bookingReadMark,
  getInboxIndexQueryKey,
  getInboxSummaryQueryKey,
  useInboxIndex,
} from "../api/generated/endpoints";
import type { EventBookingsFactsResource, InboxItemResource } from "../api/generated/model";
import { actorsText, changesText, closingText, placesText } from "../booking/bookingProgress";
import { PageSection } from "../components/PageSection";
import { Button } from "@/components/ui/button";
import { t } from "../i18n";
import { formatDay, formatInstant } from "../lib/date";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * The `kind` tokens this screen knows how to name.
 *
 * Listed rather than derived so the template literal below stays a valid
 * `TranslationKey`: a key built from an unconstrained wire token would not
 * typecheck, and widening the key type would give up its typo-catching. A new
 * source adds a member here and a key in both catalogues.
 */
const KINDS = ["contactMessage", "eventBookings"] as const;

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
 * One flat list, not grouped by kind. Each row names its kind, so two
 * sources read as one worklist rather than an unexplained mix.
 *
 * Every row links to `item.path`, where the work gets done: for
 * `contactMessage` the archive with that message open, for `eventBookings`
 * the event's guest list. An `eventBookings` row can also be marked read
 * right here, for the committee member who has seen enough in its two lines.
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
              {item.facts ? (
                <BookingsRow item={item} facts={item.facts} />
              ) : (
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
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </PageSection>
  );
}

/**
 * An event whose bookings moved since the guest list was last read: the link
 * to the list, and beside it (never inside it) the button that marks it read.
 *
 * The button sends `latestChangeId` from this very row, so a booking that
 * arrived after the inbox loaded stays unread (ADR 0035).
 */
function BookingsRow({
  item,
  facts,
}: {
  item: InboxItemResource;
  facts: EventBookingsFactsResource;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const people =
    facts.guests > 0
      ? t("common.guests", { count: facts.guests })
      : t("registrations.bookings", { count: facts.bookings });
  const moved = [changesText(facts.changes), actorsText(facts.actors)].filter(Boolean).join(" ");
  const places = facts.nearlyFull.map(placesText);

  async function markRead() {
    if (saving) {
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      const response = await bookingReadMark(item.id, { upTo: facts.latestChangeId });
      if (response.status !== 200) {
        setFailed(true);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getInboxIndexQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getInboxSummaryQueryKey() }),
      ]);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${OUTLINED_CARD} p-4`}>
      <Link to={item.path} className="focus-ring block hover:text-violet">
        <p className="text-sm text-ink-muted">{kindLabel(item.kind)}</p>
        <p data-testid="inbox-item-title" className="font-semibold">
          {item.title}
          {facts.startsAt ? (
            <span className="font-normal text-ink-muted"> · {formatDay(facts.startsAt)}</span>
          ) : null}
        </p>
        <p className="mt-tight text-sm">
          {people} · {moved}
        </p>
        <p className="mt-tight text-sm text-ink-muted">
          {[closingText(facts.closesAt, facts.closed), ...places].join(" · ")}
        </p>
      </Link>
      <Button
        type="button"
        size="sm"
        variant="raised-light"
        className="mt-related"
        aria-disabled={saving}
        onClick={() => void markRead()}
      >
        {t("inbox.eventBookings.markRead")}
      </Button>
      {failed ? (
        <p role="alert" className="mt-tight text-sm text-danger">
          {t("inbox.eventBookings.markReadFailed")}
        </p>
      ) : null}
    </div>
  );
}

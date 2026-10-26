import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  bookingReadMark,
  bookingReadUnmark,
  getBookingReadShowQueryKey,
  getInboxIndexQueryKey,
  getInboxSummaryQueryKey,
  useBookingReadShow,
} from "../api/generated/endpoints";
import type { BookingReadResource } from "../api/generated/model";
import { t } from "../i18n";
import { formatInstant } from "../lib/date";
import { actorsText, changesText } from "./bookingProgress";
import { Button } from "@/components/ui/button";

/**
 * Whether the committee has read this guest list, and what moved since
 * (#123, ADR 0035). One mark for the whole committee: marking read here takes
 * the event out of everybody's inbox.
 *
 * "Mark as read" sends `latestChangeId` from the state this screen loaded,
 * never a fresher one, so a booking that arrived while somebody was reading
 * stays unread.
 */
export function BookingReadLine({ eventId }: { eventId: number }) {
  const queryClient = useQueryClient();
  const read = useBookingReadShow(eventId);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  if (read.data?.status !== 200) {
    return null;
  }
  const state = read.data.data;
  // Nothing journaled and never read: a past event whose bookings predate the
  // journal. "No change since" would have nothing to be since.
  if (state.latestChangeId === 0 && state.markId === null) {
    return null;
  }
  const markId = state.markId;
  const moved = [changesText(state.changes), actorsText(state.actors)].filter(Boolean).join(" ");

  async function save(write: () => Promise<{ status: number; data: unknown }>) {
    if (saving) {
      return;
    }
    setSaving(true);
    setFailed(false);
    try {
      const response = await write();
      if (response.status !== 200) {
        setFailed(true);
        return;
      }
      queryClient.setQueryData(getBookingReadShowQueryKey(eventId), response);
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
    <div data-testid="booking-read" className="mt-tight text-sm">
      <p className="text-ink-muted">{readText(state)}</p>
      <p>{moved || t("registrations.readLine.nothingSince")}</p>
      <div className="mt-tight flex flex-wrap gap-tight">
        {moved ? (
          <Button
            type="button"
            size="sm"
            variant="raised-light"
            aria-disabled={saving}
            onClick={() =>
              void save(() => bookingReadMark(eventId, { upTo: state.latestChangeId }))
            }
          >
            {t("inbox.eventBookings.markRead")}
          </Button>
        ) : null}
        {markId !== null ? (
          <Button
            type="button"
            size="sm"
            variant="raised-light"
            aria-disabled={saving}
            onClick={() => void save(() => bookingReadUnmark(eventId, { mark: markId }))}
          >
            {t("registrations.readLine.markUnread")}
          </Button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="mt-tight text-danger">
          {t("registrations.readLine.failed")}
        </p>
      ) : null}
    </div>
  );
}

function readText(state: BookingReadResource): string {
  return state.readAt
    ? t("registrations.readLine.read", {
        when: formatInstant(state.readAt),
        name: state.readBy ?? "",
      })
    : t("registrations.readLine.notRead");
}

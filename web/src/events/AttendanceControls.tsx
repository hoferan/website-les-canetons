import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {
  attendanceDestroy,
  attendanceUpdate,
  getEventIndexQueryKey,
} from "../api/generated/endpoints";
import type { AttendanceResource, EventResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import { celebrate } from "../carnival/celebrate";
import { useApiFormError } from "../api/useApiFormError";
import { t, translateApiError } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { WithdrawDialog } from "./WithdrawDialog";

/**
 * The cached planning, as much of its shape as this file has to know.
 *
 * TanStack holds orval's whole `{ status, data, headers }` envelope, and ours
 * is the `{ data, meta }` inside it, so the rows are two hops down. A guard,
 * not a cast, because the same key can hold an error envelope.
 */
type CachedPlanning = { status: number; data: { data: EventResource[] } };

function isPlanning(cached: unknown): cached is CachedPlanning {
  const envelope = cached as CachedPlanning | undefined;
  return Array.isArray(envelope?.data?.data);
}

/**
 * Put an answer into every cached planning, without a refetch.
 *
 * Every cached planning: the upcoming and past lists are separate queries
 * under the same `/events` prefix, and `setQueriesData` matches by prefix.
 *
 * Nothing is invalidated afterwards. `myAttendance` is the only field an
 * answer moves, and on success this writes the server's own answer, so a
 * refetch would learn nothing and flicker the row through stale data.
 */
function patchMyAttendance(
  queryClient: QueryClient,
  eventId: number,
  answer: AttendanceResource | null,
): void {
  queryClient.setQueriesData({ queryKey: getEventIndexQueryKey() }, (cached: unknown) => {
    if (!isPlanning(cached)) {
      return cached;
    }
    return {
      ...cached,
      data: {
        ...cached.data,
        data: cached.data.data.map((event) =>
          event.id === eventId ? { ...event, myAttendance: answer } : event,
        ),
      },
    };
  });
}

/**
 * Answering for an event, from the planning, without leaving it.
 *
 * Built for a 13-year-old on a phone on a bus:
 *
 *   - Both answers are always visible, so the control shows what you answered
 *     and what you can answer at a glance. The current one is carried by
 *     `aria-pressed` and by the fill.
 *   - The control moves before the network does. The cache is patched on the
 *     way out and rolled back if the server refuses, so a tap on a bad
 *     connection is not a button that does nothing for two seconds. The card
 *     itself stays in place; the planning's docblock says why (#95).
 *   - A first answer is undoable for five minutes (ADR 0018), from the toast
 *     only. The window keeps the withdrawal reason honest: without it a member
 *     could erase a `oui` and re-answer `non` with no reason. A change is not
 *     undoable; see where the toast is raised.
 *
 * It renders nothing without `attendance.respond`. An organiser who plays
 * nothing gets `403 not_answerable` from the API, and buttons that always
 * refuse look like a broken site. The register does not decide it.
 */
export function AttendanceControls({
  event,
  inOwed = false,
}: {
  event: EventResource;
  /**
   * Whether this card is rendered inside "À répondre", where an answered card
   * stays put (#95). The pressed button alone does not explain why an answered
   * card is still under a heading that says these are owed.
   */
  inOwed?: boolean;
}) {
  const { can } = useSession();
  const queryClient = useQueryClient();

  const [withdrawing, setWithdrawing] = useState(false);
  const refusal = useApiFormError(t("attendance.ownRecordFailed"));

  const answer = event.myAttendance;

  const record = useMutation({
    mutationFn: ({ status, note }: { status: "yes" | "no"; note?: string }) =>
      attendanceUpdate(event.id, { status, note }),
  });

  const withdraw = useMutation({
    mutationFn: () => attendanceDestroy(event.id),
  });

  if (!can("attendance.respond")) {
    return null;
  }

  /**
   * Undo, offered from the toast and nowhere else.
   *
   * It takes the answer it undoes as an argument. `answer` belongs to the
   * render that raised the toast, which describes the state before the answer
   * was given, and that is the one thing this must not put back.
   */
  async function undo(recorded: AttendanceResource) {
    patchMyAttendance(queryClient, event.id, null);
    try {
      await withdraw.mutateAsync();
    } catch (thrown) {
      // Put back what was undone: the answer is still on the server, and a
      // row showing "sans réponse" that the committee's list disagrees with is
      // worse than the refusal itself. Past the five minutes this is
      // `answer_already_settled`, which says to change the answer instead.
      patchMyAttendance(queryClient, event.id, recorded);
      toast.error(
        thrown instanceof ApiError ? translateApiError(thrown).message : t("attendance.undoFailed"),
      );
    }
  }

  async function send(status: "yes" | "no", note?: string) {
    const previous = answer;

    const optimistic: AttendanceResource = {
      status,
      note: note ?? null,
      recordedByDirection: false,
      recordedAt: new Date().toISOString(),
    };

    // `recordedAt` is now, which keeps the toast's undo believable while the
    // request is still in flight.
    patchMyAttendance(queryClient, event.id, optimistic);

    try {
      const response = await record.mutateAsync({ status, note });
      const recorded = response.status === 200 ? response.data : optimistic;
      patchMyAttendance(queryClient, event.id, recorded);
      setWithdrawing(false);
      refusal.clear();

      // Confetti for a new "Oui" to an event with a celebrating tag, only
      // after the server took it and not for an "Oui" that was already the
      // answer.
      if (
        status === "yes" &&
        previous?.status !== "yes" &&
        event.tags.some((tag) => tag.celebrate)
      ) {
        celebrate();
      }

      // The undo is offered on a first answer only. DELETE is the only thing
      // behind it and returns the event to unanswered, which is right for a
      // first answer. On a change it would throw away the previous answer too,
      // and on a withdrawal the reason just collected. A mis-tapped change is
      // fixed by tapping the other answer again.
      // The toast names the event, so somebody who tapped the wrong card can
      // tell; otherwise the undo is useless to them.
      toast.success(
        t(status === "yes" ? "attendance.toastYes" : "attendance.toastNo", {
          title: event.title,
        }),
        {
          action:
            previous === null
              ? {
                  // attendance.undo, never common.cancel. Both are "Annuler"
                  // in French, but this one takes an answer back (German:
                  // "Rückgängig") and the dialogs' one closes without doing
                  // anything ("Abbrechen").
                  label: t("attendance.undo"),
                  onClick: () => void undo(recorded),
                }
              : undefined,
        },
      );
    } catch (thrown) {
      patchMyAttendance(queryClient, event.id, previous);
      refusal.setFromThrown(thrown);
      // When the dialog is open it shows the message against its field.
      // Otherwise a toast is the only surface.
      if (!withdrawing) {
        toast.error(
          thrown instanceof ApiError
            ? translateApiError(thrown).message
            : t("attendance.ownRecordFailed"),
        );
      }
    }
  }

  function answerNo() {
    // Only this transition costs a reason (ADR 0018). A first `non`, and a `non`
    // that is already stored, go straight through.
    if (answer?.status === "yes") {
      refusal.clear();
      setWithdrawing(true);
      return;
    }
    void send("no");
  }

  const busy = record.isPending || withdraw.isPending;

  return (
    <div data-testid="attendance-controls" className="mt-related">
      <div className="flex flex-wrap gap-tight">
        <Button
          type="button"
          variant={answer?.status === "yes" ? "raised-violet" : "raised-light"}
          aria-pressed={answer?.status === "yes"}
          aria-label={t("attendance.comingToAria", { title: event.title })}
          aria-disabled={busy}
          onClick={() => {
            if (busy) {
              return;
            }
            void send("yes");
          }}
        >
          {t("attendance.yesComing")}
        </Button>

        <Button
          type="button"
          variant={answer?.status === "no" ? "raised-danger" : "raised-light"}
          aria-pressed={answer?.status === "no"}
          aria-label={t("attendance.notComingToAria", { title: event.title })}
          aria-disabled={busy}
          onClick={() => {
            if (busy) {
              return;
            }
            answerNo();
          }}
        >
          {t("attendance.answer.no")}
        </Button>
      </div>

      {inOwed && answer ? (
        <p data-testid="answered-in-place" className="mt-tight text-sm text-ink-muted">
          <span aria-hidden="true">✓</span> {t("attendance.answered")}
        </p>
      ) : null}

      {/* The note beside the answer, not behind a click. It is usually the
          reason a `oui` was taken back, and the member who typed it should be
          able to see what the committee is reading. */}
      {answer?.note ? (
        <p data-testid="attendance-note" className="mt-tight text-sm text-ink-muted">
          {t("attendance.quotedNote", { note: answer.note })}
        </p>
      ) : null}

      {answer?.recordedByDirection ? (
        <p data-testid="attendance-by-direction" className="mt-tight text-sm text-ink-muted">
          {t("attendance.byCommittee")}
        </p>
      ) : null}

      <WithdrawDialog
        open={withdrawing}
        eventTitle={event.title}
        busy={record.isPending}
        error={refusal.error}
        problem={refusal.messageFor("note")}
        onConfirm={(note) => void send("no", note)}
        onCancel={() => {
          refusal.clear();
          setWithdrawing(false);
        }}
      />
    </div>
  );
}

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
import { useApiFormError } from "../api/useApiFormError";
import { translateApiError } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { WithdrawDialog } from "./WithdrawDialog";

/**
 * The cached planning, as much of its shape as this file has to know.
 *
 * TanStack holds orval's whole `{ status, data, headers }` envelope, and ours
 * is the `{ data, meta }` inside it — so the rows are two hops down. Written
 * as a guard rather than a cast because the same key can hold an error
 * envelope, and a cast would patch `.data.data.map` onto a problem document.
 */
type CachedPlanning = { status: number; data: { data: EventResource[] } };

function isPlanning(cached: unknown): cached is CachedPlanning {
  const envelope = cached as CachedPlanning | undefined;
  return Array.isArray(envelope?.data?.data);
}

/**
 * Put an answer into every cached planning, without a refetch.
 *
 * EVERY cached planning: the upcoming list and the past one are separate
 * queries under the same `/events` prefix, and `setQueriesData` matches by
 * prefix for exactly this reason.
 *
 * NOTHING IS INVALIDATED AFTERWARDS, deliberately. `myAttendance` is the only
 * field an answer moves, and what is written here on success is the server's
 * own answer rather than a guess — so a refetch would re-fetch the whole
 * planning to learn what we already hold, and the row would flicker through
 * one render of stale data on the way.
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
 * THE PRODUCT IS A 13-YEAR-OLD ON A PHONE ON A BUS (design §4). Everything
 * here follows from that:
 *
 *   - BOTH ANSWERS ARE ALWAYS VISIBLE, rather than one toggle that has to be
 *     read before it can be used. Which one is current is carried by
 *     `aria-pressed` and by the fill, so the control says what you answered
 *     and what you can answer in the same glance.
 *   - THE SCREEN MOVES BEFORE THE NETWORK DOES. The cache is patched on the
 *     way out and rolled back if the server refuses, so a tap on a bad
 *     connection is not a button that does nothing for two seconds.
 *   - A FIRST ANSWER IS UNDOABLE for five minutes (C12), from the toast and
 *     nowhere else. The window is what keeps C11 honest: without it a member
 *     could erase a `oui` and re-answer `non` for free, with no reason. A
 *     CHANGE is not undoable here, because the only thing behind undo is a
 *     DELETE — see the comment where the toast is raised.
 *
 * IT RENDERS NOTHING FOR SOMEBODY IN NO REGISTER. Dominique Direction
 * organises and plays in nothing; the API answers her `403 not_answerable`,
 * and a pair of buttons that always refuse teaches her that the site is broken
 * for her. `isPlayer` comes from the session, which is the same fact the
 * server checks.
 */
export function AttendanceControls({ event }: { event: EventResource }) {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const [withdrawing, setWithdrawing] = useState(false);
  const refusal = useApiFormError("Votre réponse n’a pas pu être enregistrée.");

  const answer = event.myAttendance;

  const record = useMutation({
    mutationFn: ({ status, note }: { status: "yes" | "no"; note?: string }) =>
      attendanceUpdate(event.id, { status, note }),
  });

  const withdraw = useMutation({
    mutationFn: () => attendanceDestroy(event.id),
  });

  if (!user?.isPlayer) {
    return null;
  }

  /**
   * Undo, offered from the toast and nowhere else.
   *
   * It takes the answer it is undoing as an argument rather than reading
   * `answer`, which is a prop of the render that RAISED the toast — by the time
   * anybody taps Annuler that render is describing the state before the answer
   * was given, which is the one thing this must not put back.
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
        thrown instanceof ApiError
          ? translateApiError(thrown).message
          : "L’annulation a échoué. Réessayez.",
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

    // Optimistic, with `recordedAt` set to now — which is what makes the undo
    // the toast offers believable while the request is still in flight.
    patchMyAttendance(queryClient, event.id, optimistic);

    try {
      const response = await record.mutateAsync({ status, note });
      const recorded = response.status === 200 ? response.data : optimistic;
      patchMyAttendance(queryClient, event.id, recorded);
      setWithdrawing(false);
      refusal.clear();

      // THE UNDO IS OFFERED ON A FIRST ANSWER ONLY, because DELETE is the only
      // thing behind it and DELETE returns the event to UNANSWERED. On a first
      // answer that is exactly right, and it is the state a second PUT cannot
      // express. On a CHANGE it would be a button labelled "Annuler" that
      // throws away the previous answer as well as the new one — and, when the
      // change was a withdrawal, throws away the reason C11 just collected
      // along with the `oui` it was given for. Somebody who mis-tapped a change
      // taps the other answer again, which costs nothing in that direction.
      toast.success(status === "yes" ? "Vous venez." : "Vous ne venez pas.", {
        action:
          previous === null
            ? {
                label: "Annuler",
                onClick: () => void undo(recorded),
              }
            : undefined,
      });
    } catch (thrown) {
      patchMyAttendance(queryClient, event.id, previous);
      refusal.setFromThrown(thrown);
      // The dialog owns the message when it is open — a blank reason lands
      // against its field. Everywhere else there is no surface to put it on
      // but a toast.
      if (!withdrawing) {
        toast.error(
          thrown instanceof ApiError
            ? translateApiError(thrown).message
            : "Votre réponse n’a pas pu être enregistrée.",
        );
      }
    }
  }

  function answerNo() {
    // C11: only this transition costs a reason. A first `non`, and a `non`
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
          variant={answer?.status === "yes" ? "default" : "outline"}
          aria-pressed={answer?.status === "yes"}
          aria-label={`Je viens à ${event.title}`}
          aria-disabled={busy}
          onClick={() => {
            if (busy) {
              return;
            }
            void send("yes");
          }}
        >
          Oui, je viens
        </Button>

        <Button
          type="button"
          variant={answer?.status === "no" ? "destructive" : "outline"}
          aria-pressed={answer?.status === "no"}
          aria-label={`Je ne viens pas à ${event.title}`}
          aria-disabled={busy}
          onClick={() => {
            if (busy) {
              return;
            }
            answerNo();
          }}
        >
          Non
        </Button>
      </div>

      {/* The note beside the answer, not behind a click. It is usually the
          reason a `oui` was taken back, and the member who typed it should be
          able to see what the committee is reading. */}
      {answer?.note ? (
        <p data-testid="attendance-note" className="mt-tight text-sm text-ink-muted">
          «&nbsp;{answer.note}&nbsp;»
        </p>
      ) : null}

      {answer?.recordedByDirection ? (
        <p data-testid="attendance-by-direction" className="mt-tight text-sm text-ink-muted">
          Réponse saisie par le comité.
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

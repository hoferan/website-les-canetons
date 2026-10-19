import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { rowsOf } from "../api/collection";
import {
  getAttendanceIndexQueryKey,
  memberAttendanceUpdate,
  useAttendanceIndex,
  useEventShow,
} from "../api/generated/endpoints";
import type { ChaseListEntryResource } from "../api/generated/model";
import { ApiError } from "../api/http";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { answerLine, nameOf } from "../events/chaseList";
import { CorrectAnswerDialog } from "../events/CorrectAnswerDialog";
import { formatEventWhen } from "../events/formatEventWhen";
import { registerName, t, translateApiError } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * Who still has to be chased about an event.
 *
 * The question is "who must I still chase?", not "who is coming?", so the
 * people who have not replied come first and the answers sit below.
 *
 * One layout, cards at every width in a grid that widens. Each answer is one
 * sentence (`answerLine`), so the reason travels with the name.
 */
export function EventAttendance() {
  const { id } = useParams();
  const eventId = Number(id);
  const { user, can } = useSession();
  const queryClient = useQueryClient();

  const [recording, setRecording] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState<ChaseListEntryResource | null>(null);
  const refusal = useApiFormError(t("attendance.recordFailed"));

  const event = useEventShow(eventId);
  const list = useAttendanceIndex(eventId);

  const entries = rowsOf<ChaseListEntryResource>(list.data);

  const yes = entries.filter((entry) => entry.attendance?.status === "yes");
  const no = entries.filter((entry) => entry.attendance?.status === "no");
  const silent = entries.filter((entry) => entry.attendance === null);

  const mayRecord = can("attendance.record_for_others");

  const record = useMutation({
    mutationFn: ({
      member,
      status,
      note,
    }: {
      member: number;
      status: "yes" | "no";
      note?: string;
    }) => memberAttendanceUpdate(eventId, member, { status, note: note || null }),
  });

  /**
   * Write an answer down for somebody, first or corrected.
   *
   * One path for both, because the endpoint is an upsert. It reports whether
   * the write landed, because the dialog stays open on a refusal so the typed
   * reason is not thrown away.
   */
  async function recordFor(
    entry: ChaseListEntryResource,
    status: "yes" | "no",
    note?: string,
  ): Promise<boolean> {
    setRecording(entry.memberId);
    try {
      await record.mutateAsync({ member: entry.memberId, status, note });
      await queryClient.invalidateQueries({ queryKey: getAttendanceIndexQueryKey(eventId) });
      refusal.clear();
      // One sentence per answer instead of the answer lowercased into one:
      // see the note on attendance.answer in fr.ts. The French space before
      // the colon is part of the string because German takes none.
      toast.success(
        t(status === "yes" ? "attendance.recordedYes" : "attendance.recordedNo", {
          name: nameOf(entry),
        }),
      );
      return true;
    } catch (thrown) {
      refusal.setFromThrown(thrown);
      // While the dialog is open it shows the refusal against its own field,
      // so a toast would say the same thing twice.
      if (!correcting) {
        toast.error(
          thrown instanceof ApiError
            ? translateApiError(thrown).message
            : t("attendance.recordFailed"),
        );
      }
      return false;
    } finally {
      setRecording(null);
    }
  }

  const title = event.data?.status === 200 ? event.data.data : null;

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        {t("common.backToPlanning")}
      </Link>

      <h1 className="mt-tight font-display text-3xl">{t("attendance.heading")}</h1>

      {title ? (
        <p data-testid="chase-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      {list.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      {list.isError ? (
        <p role="alert" className="mt-block text-red-700">
          {t("attendance.loadFailed")}
        </p>
      ) : null}

      {/* The three counts first and together: the number the committee acts
          on is the third one. */}
      {!list.isPending && !list.isError ? (
        <p data-testid="chase-counts" className="mt-block text-lg">
          {t("attendance.counts", {
            yes: yes.length,
            no: no.length,
            silent: silent.length,
          })}
        </p>
      ) : null}

      {silent.length > 0 ? (
        <section className="mt-block" aria-labelledby="silent-heading">
          <h2 id="silent-heading" className="font-display text-xl">
            {t("attendance.silentHeading")}
          </h2>

          <ul data-testid="chase-silent" className="mt-related grid gap-tight">
            {silent.map((entry) => (
              <li
                key={entry.memberId}
                className={`${OUTLINED_CARD} flex items-center justify-between gap-tight p-3`}
              >
                {/* The buttons stay in one column (#212): the name wraps in its
                    own column and the buttons never shrink or wrap, so at 390px
                    a thumb working down the list finds them in the same place
                    on every row. */}
                <span className="min-w-0 flex-1">
                  <span className="block">{nameOf(entry)}</span>
                  {entry.sectionName ? (
                    <span className="block text-sm text-ink-muted">
                      {registerName(entry.sectionName, entry.sectionNameDe)}
                    </span>
                  ) : null}
                </span>

                {/* The caller's own row. The on-behalf endpoint refuses its own
                    caller with 409, so somebody who plays and holds the
                    permission answers on the planning, where the reason rule
                    applies. */}
                {mayRecord && entry.memberId === user?.id ? (
                  <span className="max-w-[50%] text-right text-sm text-ink-muted">
                    {t("attendance.answerFromPlanning")}
                  </span>
                ) : null}

                {mayRecord && entry.memberId !== user?.id ? (
                  <span className="flex shrink-0 gap-tight">
                    <Button
                      type="button"
                      variant="raised-light"
                      size="sm"
                      aria-label={t("attendance.comingAria", { name: nameOf(entry) })}
                      aria-disabled={recording === entry.memberId}
                      onClick={() => {
                        if (recording === entry.memberId) {
                          return;
                        }
                        void recordFor(entry, "yes");
                      }}
                    >
                      {t("attendance.answer.yes")}
                    </Button>
                    <Button
                      type="button"
                      variant="raised-light"
                      size="sm"
                      aria-label={t("attendance.notComingAria", { name: nameOf(entry) })}
                      aria-disabled={recording === entry.memberId}
                      onClick={() => {
                        if (recording === entry.memberId) {
                          return;
                        }
                        void recordFor(entry, "no");
                      }}
                    >
                      {t("attendance.answer.no")}
                    </Button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Everybody who did answer, below the chase. */}
      {yes.length + no.length > 0 ? (
        <section className="mt-block" aria-labelledby="answers-heading">
          <h2 id="answers-heading" className="font-display text-xl">
            {t("attendance.answersHeading")}
          </h2>

          {/* The "non" answers come first: they are the ones with a reason to
              read, and a grid flows row-major, so they read first at every
              width. */}
          <ul
            data-testid="chase-cards"
            className="mt-related grid gap-tight sm:grid-cols-2 xl:grid-cols-3"
          >
            {[...no, ...yes].map((entry) => (
              <li key={entry.memberId} className={`${OUTLINED_CARD} p-3 text-sm`}>
                <p className="text-ink">{answerLine(entry)}</p>
                {/* Labelled, since a bare "Trompettes" under a name does not
                    say what it is. */}
                {entry.sectionName ? (
                  <p className="text-ink-muted">
                    {t("attendance.sectionLabel", {
                      name: registerName(entry.sectionName, entry.sectionNameDe),
                    })}
                  </p>
                ) : null}
                {entry.attendance?.recordedByDirection ? (
                  <p className="text-ink-muted">{t("attendance.recordedByCommittee")}</p>
                ) : null}

                <div className="mt-tight">
                  <CorrectionAction
                    entry={entry}
                    mayRecord={mayRecord}
                    mine={entry.memberId === user?.id}
                    onCorrect={setCorrecting}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!list.isPending && !list.isError && entries.length === 0 ? (
        <p className="mt-block text-ink-muted">{t("attendance.nobodyAnswerable")}</p>
      ) : null}

      {/* Keyed by the member, so the form starts from the answer it is
          correcting: a `useState` initialiser runs once per mount. */}
      {correcting?.attendance ? (
        <CorrectAnswerDialog
          key={correcting.memberId}
          name={nameOf(correcting)}
          answer={correcting.attendance}
          busy={recording === correcting.memberId}
          error={refusal.error}
          problem={refusal.messageFor("note")}
          onConfirm={(status, note) => {
            void (async () => {
              const entry = correcting;
              if (await recordFor(entry, status, note)) {
                setCorrecting(null);
              }
            })();
          }}
          onCancel={() => {
            refusal.clear();
            setCorrecting(null);
          }}
        />
      ) : null}
    </PageSection>
  );
}

/**
 * The one control that corrects an answer.
 *
 * The accessible name carries the person, so a screen-reader user hears whose
 * answer they are about to change, not one more "Corriger".
 *
 * The caller's own row, as in the Sans réponse block above: the on-behalf
 * endpoint refuses its own caller with 409, so the caller is told where their
 * own answer lives.
 */
function CorrectionAction({
  entry,
  mayRecord,
  mine,
  onCorrect,
}: {
  entry: ChaseListEntryResource;
  mayRecord: boolean;
  mine: boolean;
  onCorrect: (entry: ChaseListEntryResource) => void;
}) {
  if (!mayRecord) {
    return null;
  }

  if (mine) {
    return <span className="text-sm text-ink-muted">{t("attendance.editFromPlanning")}</span>;
  }

  return (
    <Button type="button" variant="raised-light" size="sm" onClick={() => onCorrect(entry)}>
      <span aria-hidden="true">{t("attendance.correct")}</span>
      <span className="sr-only">{t("attendance.correctFor", { name: nameOf(entry) })}</span>
    </Button>
  );
}

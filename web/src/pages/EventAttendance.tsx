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
import { t, translateApiError } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * Who still has to be chased about an event.
 *
 * IT IS NOT A REPORT OF WHO SAID YES, and the layout is the argument. The
 * people who have not replied come first, with their names and one button that
 * copies them for WhatsApp; the answers sit below. The old site had this the
 * other way round — a table of everybody, scrolling sideways at 390px,
 * answering "who is coming?" when the question the committee actually has on a
 * Thursday evening is "who must I still chase?" (design §5).
 *
 * ONE LAYOUT: CARDS, AT EVERY WIDTH, in a grid that widens (#130). A table
 * from `md` up used to sit beside them, hand-maintained, and the answer it
 * spread across three columns is one sentence here — `answerLine`, where the
 * reason travels WITH the name, which is the whole difference between a chase
 * list and a headcount.
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
   * ONE PATH FOR BOTH, because the endpoint makes no distinction: it is an
   * upsert, and a correction is the same request with the member already
   * having an answer. Reporting whether it landed is what the dialog needs —
   * it stays open on a refusal, so the typed reason is not thrown away.
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
      // TWO SENTENCES, ONE PER ANSWER, rather than one with the answer
      // lowercased into it: see the note on attendance.answer in fr.ts. The
      // French space before the colon is part of the string for the same
      // reason — German takes none.
      toast.success(
        t(status === "yes" ? "attendance.recordedYes" : "attendance.recordedNo", {
          name: nameOf(entry),
        }),
      );
      return true;
    } catch (thrown) {
      refusal.setFromThrown(thrown);
      // The dialog owns the message while it is open — a refused note lands
      // against its own field there, and a toast over it would say the same
      // thing twice in the place it is hardest to read.
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

  async function copySilent() {
    const text = silent.map(nameOf).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("attendance.copied"));
    } catch {
      // Refused rather than broken: the clipboard needs a secure context and
      // the browser's permission, and neither is this app's to grant. Saying
      // so beats a button that looks like it worked.
      toast.error(t("attendance.copyRefused"));
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

      {/* THE COUNTS FIRST, and the three of them together: a screen that shows
          only "24 oui" is answering the wrong question, because the number the
          committee acts on is the third one. */}
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
          <div className="flex flex-wrap items-center justify-between gap-related">
            <h2 id="silent-heading" className="font-display text-xl">
              {t("attendance.silentHeading")}
            </h2>
            <Button type="button" variant="outline" onClick={() => void copySilent()}>
              {t("attendance.copyForWhatsApp")}
            </Button>
          </div>

          <ul data-testid="chase-silent" className="mt-related grid gap-tight">
            {silent.map((entry) => (
              <li
                key={entry.memberId}
                className="flex flex-wrap items-center justify-between gap-tight rounded-lg border border-gray-200 bg-white p-3"
              >
                <span>
                  {nameOf(entry)}
                  {entry.sectionName ? (
                    <span className="text-ink-muted"> — {entry.sectionName}</span>
                  ) : null}
                </span>

                {/* C14 ON SCREEN. The on-behalf endpoint refuses its own
                    caller, so Bastien — who plays and holds the permission —
                    must not be offered buttons here that would 409. His own
                    answer belongs on the planning, which is also where the
                    reason rule he would otherwise walk around lives. */}
                {mayRecord && entry.memberId === user?.id ? (
                  <span className="text-sm text-ink-muted">
                    {t("attendance.answerFromPlanning")}
                  </span>
                ) : null}

                {mayRecord && entry.memberId !== user?.id ? (
                  <span className="flex gap-tight">
                    <Button
                      type="button"
                      variant="outline"
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
                      variant="outline"
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

      {/* Everybody who did answer, and what they said. Below the chase, which
          is the ordering the screen exists to impose. */}
      {yes.length + no.length > 0 ? (
        <section className="mt-block" aria-labelledby="answers-heading">
          <h2 id="answers-heading" className="font-display text-xl">
            {t("attendance.answersHeading")}
          </h2>

          {/* THE CARD IS THE ONLY LAYOUT (#130). A table from md up used to sit
              beside this, and the two were hand-maintained copies of one row.
              The "non" answers come first here: they are the ones with
              something to read beside them, and a grid flows row-major, so
              they still read first at every width. */}
          <ul
            data-testid="chase-cards"
            className="mt-related grid gap-tight sm:grid-cols-2 xl:grid-cols-3"
          >
            {[...no, ...yes].map((entry) => (
              <li
                key={entry.memberId}
                className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
              >
                <p className="text-ink">{answerLine(entry)}</p>
                {/* LABELLED, because the column head that used to say what this
                    is went with the table. A bare "Trompettes" under a name is
                    a word, not a fact. */}
                {entry.sectionName ? (
                  <p className="text-ink-muted">
                    {t("attendance.sectionLabel", { name: entry.sectionName })}
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

      {/* MOUNTED PER ROW, and keyed by the member, so the form starts from the
          answer it is correcting rather than from whichever row was opened
          first — a `useState` initialiser runs once per mount and nothing else
          would reset it. */}
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
 * WRITTEN ONCE because two copies is where the phone layout loses the next
 * thing added to the other one. It was extracted while this screen still had
 * two layouts to keep them honest; #130 removed the second, and it stays a
 * component because the correction is worth reading in one place. The
 * accessible name carries the person, so a screen-reader user hears whose
 * answer they are about to change rather than the eleventh "Corriger" on the
 * page.
 *
 * C14 ON SCREEN, here as in the Sans réponse block above: the on-behalf
 * endpoint refuses its own caller, so Bastien — who plays and holds the
 * permission — is told where his own answer lives instead of being offered a
 * button that would 409.
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
    <Button type="button" variant="outline" size="sm" onClick={() => onCorrect(entry)}>
      <span aria-hidden="true">{t("attendance.correct")}</span>
      <span className="sr-only">{t("attendance.correctFor", { name: nameOf(entry) })}</span>
    </Button>
  );
}

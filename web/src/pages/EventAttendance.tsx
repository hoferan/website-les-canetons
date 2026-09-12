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
import { PageSection } from "../components/PageSection";
import { answerLabel, answerLine, nameOf } from "../events/chaseList";
import { formatEventWhen } from "../events/formatEventWhen";
import { translateApiError } from "../i18n";
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
 * BOTH LAYOUTS ARE IN THE DOM AT ONCE and Tailwind picks by viewport, so a
 * test that queries globally finds each name twice. Scope to `chase-cards` or
 * `chase-table`.
 */
export function EventAttendance() {
  const { id } = useParams();
  const eventId = Number(id);
  const { user, can } = useSession();
  const queryClient = useQueryClient();

  const [recording, setRecording] = useState<number | null>(null);

  const event = useEventShow(eventId);
  const list = useAttendanceIndex(eventId);

  const entries = rowsOf<ChaseListEntryResource>(list.data);

  const yes = entries.filter((entry) => entry.attendance?.status === "yes");
  const no = entries.filter((entry) => entry.attendance?.status === "no");
  const silent = entries.filter((entry) => entry.attendance === null);

  const mayRecord = can("attendance.record_for_others");

  const record = useMutation({
    mutationFn: ({ member, status }: { member: number; status: "yes" | "no" }) =>
      memberAttendanceUpdate(eventId, member, { status }),
  });

  async function recordFor(entry: ChaseListEntryResource, status: "yes" | "no") {
    setRecording(entry.memberId);
    try {
      await record.mutateAsync({ member: entry.memberId, status });
      await queryClient.invalidateQueries({ queryKey: getAttendanceIndexQueryKey(eventId) });
      toast.success(`${nameOf(entry)} : ${answerLabel(status).toLowerCase()}.`);
    } catch (thrown) {
      toast.error(
        thrown instanceof ApiError
          ? translateApiError(thrown).message
          : "La réponse n’a pas pu être enregistrée.",
      );
    } finally {
      setRecording(null);
    }
  }

  async function copySilent() {
    const text = silent.map(nameOf).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Liste copiée. Collez-la dans WhatsApp.");
    } catch {
      // Refused rather than broken: the clipboard needs a secure context and
      // the browser's permission, and neither is this app's to grant. Saying
      // so beats a button that looks like it worked.
      toast.error("La copie a été refusée par le navigateur.");
    }
  }

  const title = event.data?.status === 200 ? event.data.data : null;

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        ← Retour au planning
      </Link>

      <h1 className="mt-tight font-display text-3xl">Qui vient&nbsp;?</h1>

      {title ? (
        <p data-testid="chase-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      {list.isPending ? <p className="mt-block text-ink-muted">Chargement…</p> : null}

      {list.isError ? (
        <p role="alert" className="mt-block text-red-700">
          La liste n’a pas pu être chargée.
        </p>
      ) : null}

      {/* THE COUNTS FIRST, and the three of them together: a screen that shows
          only "24 oui" is answering the wrong question, because the number the
          committee acts on is the third one. */}
      {!list.isPending && !list.isError ? (
        <p data-testid="chase-counts" className="mt-block text-lg">
          {yes.length} oui · {no.length} non · {silent.length} sans réponse
        </p>
      ) : null}

      {silent.length > 0 ? (
        <section className="mt-block" aria-labelledby="silent-heading">
          <div className="flex flex-wrap items-center justify-between gap-related">
            <h2 id="silent-heading" className="font-display text-xl">
              Sans réponse
            </h2>
            <Button type="button" variant="outline" onClick={() => void copySilent()}>
              Copier pour WhatsApp
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
                  <span className="text-sm text-ink-muted">Répondez depuis le planning.</span>
                ) : null}

                {mayRecord && entry.memberId !== user?.id ? (
                  <span className="flex gap-tight">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`${nameOf(entry)} vient`}
                      aria-disabled={recording === entry.memberId}
                      onClick={() => {
                        if (recording === entry.memberId) {
                          return;
                        }
                        void recordFor(entry, "yes");
                      }}
                    >
                      Oui
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`${nameOf(entry)} ne vient pas`}
                      aria-disabled={recording === entry.memberId}
                      onClick={() => {
                        if (recording === entry.memberId) {
                          return;
                        }
                        void recordFor(entry, "no");
                      }}
                    >
                      Non
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
            Réponses
          </h2>

          {/* Cards below md. An answer is three facts read one at a time, and
              a table of them on a 390px screen scrolls sideways — which is
              exactly what the old InscriptionsAdmin did. */}
          <ul data-testid="chase-cards" className="mt-related grid gap-tight md:hidden">
            {[...no, ...yes].map((entry) => (
              <li
                key={entry.memberId}
                className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
              >
                <p className="text-ink">{answerLine(entry)}</p>
                {entry.sectionName ? <p className="text-ink-muted">{entry.sectionName}</p> : null}
                {entry.attendance?.recordedByDirection ? (
                  <p className="text-ink-muted">Saisie par le comité.</p>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="mt-related hidden overflow-x-auto md:block">
            <table data-testid="chase-table" className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-ink-muted">
                  <th className="py-2 pr-4 font-normal">Nom</th>
                  <th className="py-2 pr-4 font-normal">Pupitre</th>
                  <th className="py-2 pr-4 font-normal">Réponse</th>
                  <th className="py-2 font-normal">Raison</th>
                </tr>
              </thead>
              <tbody>
                {/* The "non" rows first: they are the ones with something to
                    read beside them. */}
                {[...no, ...yes].map((entry) => (
                  <tr key={entry.memberId} className="border-b border-gray-100">
                    <td className="py-2 pr-4">{nameOf(entry)}</td>
                    <td className="py-2 pr-4 text-ink-muted">{entry.sectionName}</td>
                    <td className="py-2 pr-4">
                      {entry.attendance ? answerLabel(entry.attendance.status) : null}
                      {entry.attendance?.recordedByDirection ? (
                        <span className="text-ink-muted"> (comité)</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-ink-muted">{entry.attendance?.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!list.isPending && !list.isError && entries.length === 0 ? (
        <p className="mt-block text-ink-muted">
          Personne n’est encore inscrit dans un pupitre, donc personne n’a de réponse à donner.
        </p>
      ) : null}
    </PageSection>
  );
}

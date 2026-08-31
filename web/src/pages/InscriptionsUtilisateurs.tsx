import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { useEventIndex, useResponseStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { formatEventDate } from "../lib/date";
import { useSession } from "../session/SessionProvider";

/**
 * Answer one event.
 *
 * The event comes from the list rather than a dedicated endpoint — there is no
 * GET /api/events/{id}, and the list is already cached by the time anyone
 * arrives here from /sinscrire.
 *
 * It NAMES the event, which the old page did not: its heading was "Inscription
 * à l'événement" and nothing on screen said which one. That was a defect, and
 * the date and title cost nothing here.
 */
export function InscriptionsUtilisateurs() {
  const { user } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [participation, setParticipation] = useState("");
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const eventId = Number(params.get("id"));
  const events = useEventIndex();
  const event =
    Number.isInteger(eventId) && eventId > 0 && !events.isPending && !events.isError
      ? events.data.data.find((candidate) => candidate.id === eventId)
      : undefined;

  const respond = useResponseStore({
    mutation: {
      onSuccess: () => navigate("/sinscrire"),
      onError: setFromThrown,
    },
  });

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (respond.isPending || !event) return;
    clear();
    respond.mutate({
      data: {
        eventId: event.id,
        participation: participation as "participate" | "notparticipate",
      },
    });
  };

  if (events.isPending) {
    return <p className="mx-auto max-w-md px-4 py-8">Chargement…</p>;
  }

  // One message for "no id", "not a number" and "no such event": from the
  // member's side they are the same situation — the link they followed does not
  // point at an event any more.
  if (!event) {
    return (
      <section className="mx-auto max-w-md px-4 py-8">
        <h1 className="font-display text-3xl">Inscription à l’événement</h1>
        <p role="alert" className="mt-4 text-danger">
          Aucun événement à confirmer. Retournez à la liste et choisissez-en un.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-8">
      <h1 className="font-display text-3xl">Inscription à l’événement</h1>
      <p className="mt-2 text-ink-muted">
        {formatEventDate(event.date)} — {event.title}
      </p>

      <FormError error={error} />

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="response-username">Identifiant de l’utilisateur :</label>
          <input
            id="response-username"
            type="text"
            readOnly
            value={user?.username ?? ""}
            className="w-full rounded border border-line bg-ground px-3 py-2 text-ink-muted"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="response-participation">Participation :</label>
          <select
            id="response-participation"
            required
            value={participation}
            onChange={(changeEvent) => setParticipation(changeEvent.target.value)}
            className="w-full rounded border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
          >
            <option value="" disabled>
              Choisissez une option
            </option>
            <option value="participate">Je participe</option>
            <option value="notparticipate">Je ne participe pas</option>
          </select>
        </div>

        <button
          type="submit"
          aria-disabled={respond.isPending}
          className="rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          Confirmer
        </button>
      </form>
    </section>
  );
}

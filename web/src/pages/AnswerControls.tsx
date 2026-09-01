import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getEventIndexQueryKey, useResponseStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { Button } from "@/components/ui/button";

/**
 * The two answers, for one event.
 *
 * ONE TAP COMMITS. The old flow was four interactions — tap S'inscrire, land on
 * a second page, open a <select> (an OS wheel picker on a phone), pick, tap
 * Confirmer — for a yes/no question, on a screen someone reads outdoors while
 * deciding whether they play on Saturday.
 *
 * That is only safe because the answer stays CHANGEABLE. The API has always
 * upserted on (user_id, event_id); it was the UI that made a mistap permanent
 * with a disabled "Choix enregistré" button. So a mistap here self-corrects.
 *
 * Its own component, and its own state, because pending and error belong to one
 * card. Hoisted to the page they would grey out every card while one saves.
 *
 * It lives beside EventActions rather than inside a page because BOTH the
 * events list and any future single-event view need it, and it used to live
 * inside /sinscrire — the page E1c retired.
 */
export function AnswerControls({ eventId, answer }: { eventId: number; answer: string | null }) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const respond = useResponseStore({
    mutation: {
      onSuccess: async () => {
        setChanging(false);
        toast.success("Votre réponse est enregistrée.");
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      },
      onError: setFromThrown,
    },
  });

  const send = (participation: "participate" | "notparticipate") => {
    if (respond.isPending) return;
    clear();
    respond.mutate({ data: { eventId, participation } });
  };

  if (answer && !changing) {
    return (
      <>
        <p className="font-semibold text-violet">
          {answer === "participate" ? "Je participe" : "Je ne participe pas"}
        </p>
        <Button type="button" variant="outline" onClick={() => setChanging(true)}>
          Modifier
        </Button>
      </>
    );
  }

  return (
    <>
      {/* w-full so the error takes its own line: this renders into
          EventCard's `actions` row, which is a flex container, and a bare
          FormError would sit beside a button instead of above both. */}
      <div className="w-full">
        <FormError error={error} />
      </div>
      <Button
        type="button"
        aria-disabled={respond.isPending}
        onClick={() => send("participate")}
        className="flex-1 sm:flex-none"
      >
        Je participe
      </Button>
      <Button
        type="button"
        variant="outline"
        aria-disabled={respond.isPending}
        onClick={() => send("notparticipate")}
        className="flex-1 sm:flex-none"
      >
        Je ne participe pas
      </Button>
    </>
  );
}

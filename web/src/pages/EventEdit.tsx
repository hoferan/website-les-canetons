import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { eventShow, eventUpdate, getEventIndexQueryKey } from "../api/generated/endpoints";
import type { EventResource, UpdateEventRequest } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { EventForm, eventBodyFrom, type EventDraft } from "../events/EventForm";

/**
 * Correcting one event.
 *
 * IT READS THE EVENT BEFORE SHOWING IT, rather than seeding the form from the
 * row the planning already had. The PATCH is a conditional write — refused
 * without an `If-Match`, refused with a stale one — and the tag has to
 * describe what the organiser was looking at when they decided what to change.
 * The planning hands out no tag at all, deliberately: one tag cannot validate
 * five rows. So this read is both where the form's values come from and where
 * the concurrency window opens — "while this form was open".
 *
 * THE READ IS IMPERATIVE AND HAPPENS ONCE, not a `useQuery`. A query would
 * refetch in the background on a focus change, advancing the tag while the
 * form still shows the values it was opened with — which satisfies the server
 * and protects nobody, since the window it exists to cover is exactly the one
 * where somebody else was editing. The pair has to move together or not at
 * all.
 */
export function EventEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError("L’enregistrement a échoué.");

  const eventId = Number(id);

  const [opened, setOpened] = useState<{ event: EventResource; etag: string | null } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  // By hand over the generated function, because the `If-Match` differs per
  // call and orval's mutation hooks fix their request options when the hook is
  // created — see web/src/api/ifMatch.ts.
  const update = useMutation({
    mutationFn: ({ data, etag }: { data: UpdateEventRequest; etag: string }) =>
      eventUpdate(eventId, data, ifMatch(etag)),
  });

  useEffect(() => {
    // Guards a StrictMode double-invoke and a fast back-navigation alike: a
    // response arriving after this effect is torn down must not set state on a
    // screen the organiser has already left.
    let abandoned = false;

    async function open() {
      try {
        const response = await eventShow(eventId);
        if (abandoned) {
          return;
        }
        if (response.status !== 200) {
          // Unreachable: the mutator throws on every non-2xx. The declared
          // union says otherwise and tsc is right that it does.
          setReadError("Cet événement n’a pas pu être chargé.");
          return;
        }
        setOpened({ event: response.data, etag: entityTagOf(response) });
      } catch {
        if (!abandoned) {
          setReadError("Cet événement n’a pas pu être chargé. Rechargez la page.");
        }
      }
    }

    void open();

    return () => {
      abandoned = true;
    };
  }, [eventId]);

  async function submit(draft: EventDraft) {
    form.clear();

    if (opened?.etag == null) {
      // Without a tag the write is refused with 428, which reads on screen as
      // a broken save. Saying so and stopping is the honest answer.
      setReadError("Cet événement n’a pas pu être chargé. Rechargez la page.");
      return;
    }

    try {
      await update.mutateAsync({ data: eventBodyFrom(draft), etag: opened.etag });
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      navigate("/events");
    } catch (thrown) {
      // Open, for the same reason as the create screen — and here it also
      // matters for the 412: "quelqu'un a modifié cet élément entre-temps" is
      // only useful next to the values it is about.
      form.setFromThrown(thrown);
    }
  }

  return (
    <PageSection>
      <h1 className="font-display text-3xl">Modifier l’événement</h1>

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {opened === null && readError === null ? (
        <p className="mt-block text-ink-muted">Chargement…</p>
      ) : null}

      {opened ? (
        <EventForm
          event={opened.event}
          busy={update.isPending}
          error={form.error}
          problemFor={form.messageFor}
          onSubmit={submit}
          onCancel={() => navigate("/events")}
        />
      ) : null}
    </PageSection>
  );
}

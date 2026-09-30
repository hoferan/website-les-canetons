import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getEventIndexQueryKey, useEventStore } from "../api/generated/endpoints";
import { ApiError } from "../api/http";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { EventForm, eventBodyFrom, type EventDraft } from "../events/EventForm";
import { publishEvent } from "../events/publishEvent";
import { t, translateApiError } from "../i18n";

/**
 * Adding one event to the planning.
 *
 * A PAGE, NOT A PANEL ON `/events`. The roster opens its form inline because
 * an administrator adding people adds several in a row against the list they
 * are reading; an event is entered once, from a phone, often while somebody
 * reads the date out loud — and a URL that can be opened, bookmarked and
 * returned to after a wrong turn is worth more here than staying beside the
 * list.
 *
 * EVERY EVENT IS CREATED AS A DRAFT, and the form offers two ways to finish:
 * save it as it is, or publish it. Publishing is a second call after the save,
 * so an incomplete form is saved and then refused with the fields it lacks;
 * the organiser lands on the saved draft's own edit screen with that refusal
 * carried along, because staying here would offer a second save that makes a
 * second event.
 *
 * The whole screen is behind `events.manage` in the route table, so there is
 * no permission check in here: the form is unreachable without it and a second
 * copy of the rule would be one more thing to drift.
 */
export function EventNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("eventForm.saveFailed"));
  const create = useEventStore();

  // BUSY FROM THE CREATE THROUGH THE PUBLISH. The create finishes before the
  // publish starts, and `create.isPending` alone left the form open in the gap:
  // a second tap on Publier saved a second event.
  const [working, setWorking] = useState(false);

  async function submit(draft: EventDraft, intent: "save" | "publish") {
    form.clear();
    setWorking(true);

    try {
      const created = await create.mutateAsync({ data: eventBodyFrom(draft) });
      // Both halves of the planning: getEventIndexQueryKey() is `["/events"]`,
      // which prefix-matches the upcoming list and the `?past=1` one alike.
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });

      if (intent === "publish" && created.status === 201) {
        try {
          await publishEvent(created.data.id);
        } catch (refused) {
          // The draft exists now. Take the organiser to it with the refusal.
          await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
          navigate(`/events/${created.data.id}/edit`, {
            state: {
              refusal:
                refused instanceof ApiError
                  ? translateApiError(refused)
                  : { message: t("eventForm.saveFailed"), fields: [] },
            },
          });
          return;
        }
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      }

      navigate("/events");
    } catch (thrown) {
      // The form STAYS OPEN. A refused date has to be corrected where it was
      // typed, and navigating away would throw the other five fields away too.
      form.setFromThrown(thrown);
    } finally {
      setWorking(false);
    }
  }

  return (
    <PageSection>
      <h1 className="font-display text-3xl">{t("eventForm.newHeading")}</h1>

      <EventForm
        event={null}
        mode="draft"
        busy={create.isPending || working}
        error={form.error}
        problemFor={form.messageFor}
        onSubmit={submit}
        onCancel={() => navigate("/events")}
      />
    </PageSection>
  );
}

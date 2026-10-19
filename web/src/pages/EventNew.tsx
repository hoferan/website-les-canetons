import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getEventIndexQueryKey, useEventStore } from "../api/generated/endpoints";
import { ApiError } from "../api/http";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { EventForm, eventBodyFrom, type EventDraft } from "../events/EventForm";
import { publishEvent } from "../events/publishEvent";
import { saveEventPoster, type PosterChange } from "../events/saveEventPoster";
import { t, translateApiError } from "../i18n";

/**
 * Adding one event to the planning.
 *
 * A page, not a panel on `/events`: the roster adds several people in a row
 * against its list, while an event is entered once, and a URL can be
 * bookmarked and returned to after a wrong turn.
 *
 * Every event is created as a draft; the form saves it as it is or publishes
 * it. Publishing is a second call after the save, so an incomplete form is
 * saved and then refused with the fields it lacks. The organiser then lands
 * on the draft's edit screen with that refusal, because staying here would
 * offer a second save that makes a second event.
 *
 * The route table puts the screen behind `events.manage`, so there is no
 * permission check in here.
 */
export function EventNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("eventForm.saveFailed"));
  const create = useEventStore();

  // Busy from the create through the publish: `create.isPending` alone leaves
  // the form open in the gap, and a second tap on Publier would save a second
  // event.
  const [working, setWorking] = useState(false);

  async function submit(draft: EventDraft, intent: "save" | "publish", poster: PosterChange) {
    form.clear();
    setWorking(true);

    try {
      const created = await create.mutateAsync({ data: eventBodyFrom(draft) });

      // The poster before the publish, so the band never sees the event
      // without it. A poster that fails leaves a saved draft, so the organiser
      // goes to it, like a refused publish.
      if (
        created.status === 201 &&
        !(await saveEventPoster(created.data.id, created.data.title, poster, queryClient))
      ) {
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
        navigate(`/events/${created.data.id}/edit`, {
          state: { refusal: { message: t("eventForm.posterFailed"), fields: [] } },
        });
        return;
      }

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
      // The form stays open, so a refused date is corrected where it was typed
      // and the other fields are kept.
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

import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getEventIndexQueryKey, useEventStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { EventForm, eventBodyFrom, type EventDraft } from "../events/EventForm";

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
 * The whole screen is behind `events.manage` in the route table, so there is
 * no permission check in here: the form is unreachable without it and a second
 * copy of the rule would be one more thing to drift.
 */
export function EventNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError("L’enregistrement a échoué.");
  const create = useEventStore();

  async function submit(draft: EventDraft) {
    form.clear();

    try {
      await create.mutateAsync({ data: eventBodyFrom(draft) });
      // Both halves of the planning: getEventIndexQueryKey() is `["/events"]`,
      // which prefix-matches the upcoming list and the `?past=1` one alike.
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      navigate("/events");
    } catch (thrown) {
      // The form STAYS OPEN. A refused date has to be corrected where it was
      // typed, and navigating away would throw the other five fields away too.
      form.setFromThrown(thrown);
    }
  }

  return (
    <PageSection>
      <h1 className="font-display text-3xl">Nouvel événement</h1>

      <EventForm
        event={null}
        busy={create.isPending}
        error={form.error}
        problemFor={form.messageFor}
        onSubmit={submit}
        onCancel={() => navigate("/events")}
      />
    </PageSection>
  );
}

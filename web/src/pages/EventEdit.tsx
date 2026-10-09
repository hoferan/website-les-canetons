import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { eventShow, eventUpdate, getEventIndexQueryKey } from "../api/generated/endpoints";
import type { EventResource, UpdateEventRequest } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { EventForm, eventBodyFrom, type EventDraft } from "../events/EventForm";
import { publishEvent } from "../events/publishEvent";
import { saveEventPoster, type PosterChange } from "../events/saveEventPoster";
import { t, type TranslatedError } from "../i18n";

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
  const form = useApiFormError(t("eventForm.saveFailed"));

  const eventId = Number(id);

  // A refusal carried here from the create screen: a draft was saved and then
  // refused publication, and the organiser is sent to the saved draft with
  // the fields it still lacks. Cleared by the next save.
  const location = useLocation();
  const [carried, setCarried] = useState<TranslatedError | null>(
    (location.state as { refusal?: TranslatedError } | null)?.refusal ?? null,
  );

  const [opened, setOpened] = useState<{ event: EventResource; etag: string | null } | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  // By hand over the generated function, because the `If-Match` differs per
  // call and orval's mutation hooks fix their request options when the hook is
  // created — see web/src/api/ifMatch.ts.
  const update = useMutation({
    mutationFn: ({ data, etag }: { data: UpdateEventRequest; etag: string }) =>
      eventUpdate(eventId, data, ifMatch(etag)),
  });

  // BUSY FROM THE SAVE THROUGH THE POSTER AND THE PUBLISH, as on the create
  // screen: `update.isPending` alone left the form open between the writes.
  const [working, setWorking] = useState(false);

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
          setReadError(t("eventForm.loadFailed"));
          return;
        }
        setOpened({ event: response.data, etag: entityTagOf(response) });
      } catch {
        if (!abandoned) {
          setReadError(t("eventForm.loadFailedReload"));
        }
      }
    }

    void open();

    return () => {
      abandoned = true;
    };
  }, [eventId]);

  async function submit(draft: EventDraft, intent: "save" | "publish", poster: PosterChange) {
    form.clear();
    setCarried(null);

    if (opened?.etag == null) {
      // Without a tag the write is refused with 428, which reads on screen as
      // a broken save. Saying so and stopping is the honest answer.
      setReadError(t("eventForm.loadFailedReload"));
      return;
    }

    setWorking(true);
    try {
      const saved = await update.mutateAsync({ data: eventBodyFrom(draft), etag: opened.etag });
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });

      // The save handed out the tag of what it wrote. Keep it as the form's
      // own tag first: if the poster or the publish fails, the next save must
      // not be refused as stale.
      const fresh = saved.status === 200 ? entityTagOf(saved) : null;
      if (saved.status === 200) {
        setOpened({ event: saved.data, etag: fresh });
      }

      // The poster before the publish, so the band never sees the event
      // without it. The poster is not in the tag, so its write leaves `fresh`
      // current.
      if (!(await saveEventPoster(eventId, draft.title, poster, queryClient))) {
        setCarried({ message: t("eventForm.posterFailed"), fields: [] });
        return;
      }

      if (intent === "publish") {
        await publishEvent(eventId, fresh);
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      }

      navigate("/events");
    } catch (thrown) {
      // Open, for the same reason as the create screen — and here it also
      // matters for the 412: "quelqu'un a modifié cet élément entre-temps" is
      // only useful next to the values it is about.
      form.setFromThrown(thrown);
    } finally {
      setWorking(false);
    }
  }

  return (
    <PageSection>
      <h1 className="font-display text-3xl">{t("eventForm.editHeading")}</h1>

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {opened === null && readError === null ? (
        <p className="mt-block text-ink-muted">{t("common.loading")}</p>
      ) : null}

      {opened ? (
        <EventForm
          event={opened.event}
          mode={opened.event.publishedAt === null ? "draft" : "published"}
          busy={update.isPending || working}
          error={form.error ?? carried}
          problemFor={(field) =>
            form.messageFor(field) ??
            carried?.fields.find((entry) => entry.field === field)?.message
          }
          onSubmit={submit}
          onCancel={() => navigate("/events")}
        />
      ) : null}
    </PageSection>
  );
}

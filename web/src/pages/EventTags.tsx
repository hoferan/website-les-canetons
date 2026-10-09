import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { rowsOf } from "../api/collection";
import {
  eventTagDestroy,
  eventTagShow,
  eventTagStore,
  eventTagUpdate,
  getEventIndexQueryKey,
  getEventTagIndexQueryKey,
  useEventTagIndex,
} from "../api/generated/endpoints";
import type { EventTagResource, TagColour } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField, formIsValid } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { TagChip } from "../events/TagChip";
import { TAG_COLOURS } from "../events/tagColours";
import { t, tagLabel } from "../i18n";
import { OUTLINED_CARD } from "../carnival/raised";

const COLOURS = Object.keys(TAG_COLOURS) as TagColour[];

type TagDraft = { labelFr: string; labelDe: string; colour: TagColour; celebrate: boolean };

const EMPTY: TagDraft = { labelFr: "", labelDe: "", colour: "violet", celebrate: false };

function bodyOf(draft: TagDraft) {
  return {
    labelFr: draft.labelFr,
    labelDe: draft.labelDe.trim() === "" ? null : draft.labelDe,
    colour: draft.colour,
    celebrate: draft.celebrate,
  };
}

/**
 * The committee's list of event tags (#107): create, rename, recolour,
 * delete. Choosing which tags an event carries happens in the event's own
 * form, where the event is; this page only keeps the list.
 *
 * Rename and delete each start with a read of the one tag, whose `ETag` the
 * write quotes back, so two people editing the same tag cannot overwrite each
 * other without being told.
 */
export function EventTags() {
  const queryClient = useQueryClient();
  const list = useEventTagIndex();
  const tags = rowsOf<EventTagResource>(list.data);

  const refresh = async () => {
    // The planning too: its cards carry copies of these names and colours.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getEventTagIndexQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() }),
    ]);
  };

  return (
    <PageSection width="form">
      <h1 className="font-display text-3xl">{t("eventTags.heading")}</h1>
      <p className="mt-tight text-ink-muted">{t("eventTags.intro")}</p>

      {list.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      <ul className="mt-block grid gap-related">
        {tags.map((tag) => (
          <TagRow key={tag.id} tag={tag} onChanged={refresh} />
        ))}
      </ul>

      <NewTag onCreated={refresh} />
    </PageSection>
  );
}

function TagRow({ tag, onChanged }: { tag: EventTagResource; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<{ draft: TagDraft; etag: string } | null>(null);
  const [deleting, setDeleting] = useState<{ count: number; etag: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useApiFormError(t("eventTags.saveFailed"));
  const removing = useApiFormError(t("eventTags.deleteFailed"));
  const flipping = useApiFormError(t("eventTags.saveFailed"));
  // The switch shows the new value while its write is in flight, and falls
  // back to the stored one once the list has it or the server refused.
  const [flipped, setFlipped] = useState<boolean | null>(null);

  // Saved on the flip, so it reads the tag for the If-Match and sends the
  // names and colour of that read back unchanged: the body replaces the tag
  // whole, and a rename made meanwhile must survive.
  const flip = async (celebrate: boolean) => {
    setFlipped(celebrate);
    setBusy(true);
    flipping.clear();
    try {
      const read = await eventTagShow(tag.id);
      const etag = read.status === 200 ? entityTagOf(read) : null;
      if (read.status !== 200 || etag === null) {
        return;
      }
      const { labelFr, labelDe, colour } = read.data;
      await eventTagUpdate(tag.id, { labelFr, labelDe, colour, celebrate }, ifMatch(etag));
      await onChanged();
    } catch (thrown) {
      flipping.setFromThrown(thrown);
    } finally {
      setFlipped(null);
      setBusy(false);
    }
  };

  // The read is also where "while this form was open" starts, so it happens
  // when the row opens, not when it saves.
  const open = async (then: "edit" | "delete") => {
    setBusy(true);
    try {
      const read = await eventTagShow(tag.id);
      const etag = read.status === 200 ? entityTagOf(read) : null;
      if (read.status !== 200 || etag === null) {
        return;
      }
      if (then === "edit") {
        saving.clear();
        setEditing({
          draft: {
            labelFr: read.data.labelFr,
            labelDe: read.data.labelDe ?? "",
            colour: read.data.colour,
            celebrate: read.data.celebrate,
          },
          etag,
        });
      } else {
        removing.clear();
        setDeleting({ count: read.data.eventCount ?? 0, etag });
      }
    } catch (thrown) {
      (then === "edit" ? saving : removing).setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (editing === null) {
      return;
    }
    setBusy(true);
    try {
      await eventTagUpdate(tag.id, bodyOf(editing.draft), ifMatch(editing.etag));
      await onChanged();
      setEditing(null);
    } catch (thrown) {
      saving.setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (deleting === null) {
      return;
    }
    setBusy(true);
    try {
      await eventTagDestroy(tag.id, ifMatch(deleting.etag));
      setDeleting(null);
      await onChanged();
    } catch (thrown) {
      removing.setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li data-testid="event-tag-row" className={`${OUTLINED_CARD} p-4`}>
      {editing === null ? (
        <div className="flex flex-wrap items-center justify-between gap-related">
          <div className="flex w-full flex-wrap items-center gap-tight text-sm">
            <TagChip tag={tag} />
            {/* Both names, so a German page and a French one can be checked
                from either. The chip shows the current page's. */}
            <span className="text-ink-muted">
              {tag.labelFr}
              {tag.labelDe === null ? "" : ` · ${tag.labelDe}`}
            </span>
            <span className="text-ink-muted">
              {t("eventTags.count", { count: tag.eventCount ?? 0 })}
            </span>
          </div>
          {/* Apart from the buttons: it is a setting, and they are actions.
              On a phone the buttons wrap under it rather than leaving
              "Supprimer" on a line of its own. */}
          <div className="flex min-h-touch items-center gap-2">
            <Switch
              id={`tag-${tag.id}-celebrate`}
              checked={flipped ?? tag.celebrate}
              disabled={busy}
              aria-label={t("eventTags.celebrateAria", { label: tagLabel(tag) })}
              onCheckedChange={(next) => void flip(next)}
            />
            <label htmlFor={`tag-${tag.id}-celebrate`} className="text-sm">
              {t("eventTags.celebrate")}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-tight">
            <Button
              type="button"
              variant="raised-light"
              aria-label={t("eventTags.editAria", { label: tagLabel(tag) })}
              disabled={busy}
              onClick={() => void open("edit")}
            >
              {t("common.edit")}
            </Button>
            <Button
              type="button"
              variant="raised-light"
              aria-label={t("eventTags.deleteAria", { label: tagLabel(tag) })}
              disabled={busy}
              onClick={() => void open("delete")}
            >
              {t("common.delete")}
            </Button>
          </div>
          {flipping.error !== null ? (
            <p role="alert" className="w-full text-sm text-danger">
              {flipping.error.message}
            </p>
          ) : null}
          {removing.error !== null && deleting === null ? (
            <p role="alert" className="w-full text-sm text-danger">
              {removing.error.message}
            </p>
          ) : null}
        </div>
      ) : (
        <form
          noValidate
          className="grid gap-related"
          onSubmit={(submitted) => {
            submitted.preventDefault();
            if (!formIsValid(submitted.currentTarget)) {
              return;
            }
            void save();
          }}
        >
          {/* The chip as it will look, updated as the names and colour change. */}
          <div className="text-sm">
            <TagChip tag={{ ...bodyOf(editing.draft) }} />
          </div>
          <TagFields
            idPrefix={`tag-${tag.id}`}
            draft={editing.draft}
            onChange={(draft) => setEditing({ ...editing, draft })}
            problemFor={saving.messageFor}
          />
          <FormError error={saving.error} />
          <div className="flex flex-wrap gap-tight">
            <Button type="submit" disabled={busy}>
              {t("common.save")}
            </Button>
            <Button type="button" variant="raised-light" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("eventTags.deleteTitle", { label: tagLabel(tag) })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting !== null && deleting.count > 0
                ? t("eventTags.deleteUsed", { count: deleting.count })
                : t("eventTags.deleteUnused")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div role="alert">
            {removing.error !== null ? (
              <p className="text-danger">{removing.error.message}</p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="raised-danger"
              disabled={busy}
              onClick={() => void destroy()}
            >
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function NewTag({ onCreated }: { onCreated: () => Promise<void> }) {
  const [draft, setDraft] = useState<TagDraft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const creating = useApiFormError(t("eventTags.saveFailed"));

  return (
    <form
      noValidate
      aria-labelledby="new-tag-heading"
      className="mt-block grid gap-related rounded-lg border border-dashed border-line p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (!formIsValid(submitted.currentTarget)) {
          return;
        }
        setBusy(true);
        void eventTagStore(bodyOf(draft))
          .then(async () => {
            creating.clear();
            setDraft(EMPTY);
            await onCreated();
          })
          .catch(creating.setFromThrown)
          .finally(() => setBusy(false));
      }}
    >
      <h2 id="new-tag-heading" className="font-display text-xl">
        {t("eventTags.newHeading")}
      </h2>
      <TagFields
        idPrefix="new-tag"
        draft={draft}
        onChange={setDraft}
        problemFor={creating.messageFor}
      />
      <FormError error={creating.error} />
      <div>
        <Button type="submit" disabled={busy}>
          {t("eventTags.add")}
        </Button>
      </div>
    </form>
  );
}

/**
 * The two names and the colour, shared by the new-tag form and a row being
 * edited. Not the confetti flag: that is the row's switch, saved as it is
 * flipped, and a new tag starts without it.
 */
function TagFields({
  idPrefix,
  draft,
  onChange,
  problemFor,
}: {
  idPrefix: string;
  draft: TagDraft;
  onChange: (draft: TagDraft) => void;
  problemFor: (field: string) => string | undefined;
}) {
  return (
    <>
      <FormField
        id={`${idPrefix}-fr`}
        label={t("fields.labelFr")}
        value={draft.labelFr}
        onChange={(labelFr) => onChange({ ...draft, labelFr })}
        problem={problemFor("labelFr")}
        required
        maxLength={40}
      />
      <FormField
        id={`${idPrefix}-de`}
        label={t("fields.labelDe")}
        value={draft.labelDe}
        onChange={(labelDe) => onChange({ ...draft, labelDe })}
        problem={problemFor("labelDe")}
        maxLength={40}
      />
      {/* Real radio inputs, one per colour, each named by its colour so a
          screen reader does not hear eight unlabelled swatches. */}
      <fieldset>
        <legend className="text-sm font-medium text-ink">{t("eventTags.colour")}</legend>
        <div className="mt-tight flex flex-wrap gap-1">
          {COLOURS.map((colour) => (
            <label key={colour} className="inline-flex min-h-touch cursor-pointer items-center">
              <input
                type="radio"
                name={`${idPrefix}-colour`}
                value={colour}
                checked={draft.colour === colour}
                onChange={() => onChange({ ...draft, colour })}
                className="peer sr-only"
              />
              <span
                className={`rounded-full border-2 px-3 py-1 text-sm ${TAG_COLOURS[colour]} border-transparent peer-checked:border-current peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50`}
              >
                {t(`eventTags.colours.${colour}`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

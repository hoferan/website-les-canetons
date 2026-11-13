import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@ds";
import { IconButton } from "@/components/ui/icon-button";

import {
  historyEntryShow,
  historyEntryStore,
  historyEntryUpdate,
} from "../api/generated/endpoints";
import type { HistoryEntryResource, StoreHistoryEntryRequest } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { EditorMenu } from "../content/editor/EditorMenu";
import { EditorPanel, EditorPanelForm } from "../content/editor/EditorPanel";
import { currentLocale, t } from "../i18n";
import { dateWithPreposition, shownIn } from "./entry";
import {
  HistoryForm,
  type HistoryDraft,
  type HistoryFormHandle,
  type PhotoChange,
} from "./HistoryForm";
import { invalidateHistory, saveHistoryPhoto } from "./saveHistoryPhoto";

/** Which entry the panel is open on: a new one, or a stored one by id. */
export type HistoryOpened = { kind: "new" } | { kind: "edit"; id: number };

/** What the open panel's element on the page is found by (`EditorPanel`'s `target`). */
export const historyEditTarget = (opened: HistoryOpened) =>
  opened.kind === "new" ? "history/new" : `history/${opened.id}`;

/** Marks the panel's ⋯, which focus goes back to when a delete asked from it is cancelled. */
export const PANEL_MENU = "history-panel-menu";

/** An entry's name, as its card's controls say it: its title, or its date. */
function nameOf(entry: HistoryEntryResource): string {
  const locale = currentLocale();
  return (
    shownIn(entry, locale).title ??
    t("history.untitledEntry", {
      of: dateWithPreposition(entry.occurredOn, entry.precision, locale),
    })
  );
}

/**
 * A history entry's editor in the side panel every public page edits in
 * (#419), opened on /history from a card's ✎ or from "Ajouter".
 *
 * A stored entry is read again when the panel opens, and the form shows what
 * that read returned: the save quotes its tag (`If-Match`), so a colleague's
 * change in between is refused (412) and said in the panel, next to the
 * values it is about. The photo is saved after the entry, by its own write.
 *
 * While the panel is open the page shows the entry as typed (`onDraft`);
 * after a save it reads the stored one, after a discard the one it had.
 */
export function HistoryPanel({
  opened,
  onClose,
  onSaved,
  onDraft,
  onDelete,
}: {
  opened: HistoryOpened | null;
  onClose: () => void;
  /** After a save, with whether the photo failed to follow the entry. */
  onSaved: (photoFailed: boolean) => void;
  onDraft: (draft: HistoryDraft) => void;
  onDelete: (entry: HistoryEntryResource) => void;
}) {
  const editor = useRef<HistoryFormHandle>(null);
  const close = () => (editor.current ? editor.current.requestClose() : onClose());
  const [title, setTitle] = useState("");
  const above = t("nav.history");
  const heading =
    opened?.kind === "new" ? t("historyForm.newHeading") : title || t("historyForm.editHeading");

  return (
    <EditorPanel
      open={opened !== null}
      onRequestClose={close}
      label={`${above} · ${heading}`}
      above={above}
      title={heading}
      target={opened ? historyEditTarget(opened) : "history/new"}
      menu={opened?.kind === "edit"}
    >
      {opened ? (
        <PanelBody
          // A new opening starts from the page as it is, never from an
          // abandoned edit of another entry.
          key={historyEditTarget(opened)}
          opened={opened}
          editor={editor}
          onClose={onClose}
          onSaved={onSaved}
          onDraft={onDraft}
          onDelete={onDelete}
          onTitle={setTitle}
        />
      ) : null}
    </EditorPanel>
  );
}

function PanelBody({
  opened,
  editor,
  onClose,
  onSaved,
  onDraft,
  onDelete,
  onTitle,
}: {
  opened: HistoryOpened;
  editor: React.RefObject<HistoryFormHandle | null>;
  onClose: () => void;
  onSaved: (photoFailed: boolean) => void;
  onDraft: (draft: HistoryDraft) => void;
  onDelete: (entry: HistoryEntryResource) => void;
  onTitle: (title: string) => void;
}) {
  const queryClient = useQueryClient();
  const form = useApiFormError(t("historyForm.saveFailed"));
  const [read, setRead] = useState<{ entry: HistoryEntryResource; etag: string | null } | null>(
    null,
  );
  const [readError, setReadError] = useState<string | null>(null);
  const editId = opened.kind === "edit" ? opened.id : null;

  const write = useMutation({
    mutationFn: async ({
      data,
      etag,
    }: {
      data: StoreHistoryEntryRequest;
      etag: string | null;
    }): Promise<HistoryEntryResource> => {
      if (editId === null) {
        const response = await historyEntryStore(data);
        // The mutator throws on every non-2xx, so this only narrows the type.
        if (response.status !== 201) throw new Error(`unexpected ${response.status}`);
        return response.data;
      }
      // By hand, because the If-Match differs per call; see web/src/api/ifMatch.ts.
      const response = await historyEntryUpdate(editId, data, ifMatch(etag ?? ""));
      if (response.status !== 200) throw new Error(`unexpected ${response.status}`);
      return response.data;
    },
  });

  // Read once on opening, for the tag the save quotes.
  useEffect(() => {
    if (editId === null) return;
    let abandoned = false;
    void (async () => {
      try {
        const response = await historyEntryShow(editId);
        if (abandoned) return;
        if (response.status !== 200) {
          // Unreachable: the mutator throws on every non-2xx.
          setReadError(t("historyForm.loadFailed"));
          return;
        }
        setRead({ entry: response.data, etag: entityTagOf(response) });
        onTitle(nameOf(response.data));
      } catch {
        if (!abandoned) setReadError(t("historyForm.loadFailed"));
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [editId, onTitle]);

  // The page shows the draft, and the header names the entry as typed, as a
  // card's editor names its card.
  const showDraft = useCallback(
    (draft: HistoryDraft) => {
      onDraft(draft);
      if (read) onTitle(nameOf({ ...read.entry, ...draft }));
    },
    [onDraft, onTitle, read],
  );

  async function submit(data: StoreHistoryEntryRequest, photo: PhotoChange) {
    form.clear();
    if (editId !== null && read?.etag == null) {
      // Without a tag the write is refused with 428, which would read as a
      // broken save.
      setReadError(t("historyForm.loadFailed"));
      return;
    }
    let saved: HistoryEntryResource;
    try {
      saved = await write.mutateAsync({ data, etag: read?.etag ?? null });
    } catch (thrown) {
      // The panel stays open, so a refusal, a 412 included, is read next to
      // the values it is about.
      form.setFromThrown(thrown);
      return;
    }
    // The entry exists from here on, so whatever the photo does, the panel
    // closes: saving a new one again would add it twice.
    const photoSaved = await saveHistoryPhoto(saved, photo);
    await invalidateHistory(queryClient);
    onSaved(!photoSaved);
  }

  // A stored entry shows nothing until it is read: a form opened on the
  // list's copy would quote a tag that describes something else.
  if (editId !== null && read === null) {
    return (
      <EditorPanelForm
        onSubmit={(event) => event.preventDefault()}
        pending
        // The panel's one error line, as for a refused save.
        error={readError ? { message: readError, fields: [] } : null}
        onCancel={onClose}
      >
        {readError ? null : <p className="text-ink-muted">{t("common.loading")}</p>}
      </EditorPanelForm>
    );
  }

  return (
    <HistoryForm
      ref={editor}
      entry={read?.entry ?? null}
      busy={write.isPending}
      error={form.error ?? (readError ? { message: readError, fields: [] } : null)}
      problemFor={form.messageFor}
      onSubmit={(data, photo) => void submit(data, photo)}
      onCancel={onClose}
      onDraft={showDraft}
      // Inside the form, so it reaches the header slot the panel keeps for it.
      menu={
        read ? (
          <EditorMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={Ellipsis}
                  label={t("history.more", { name: nameOf(read.entry) })}
                  data-history-menu={PANEL_MENU}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem destructive onSelect={() => onDelete(read.entry)}>
                  <Trash2 aria-hidden="true" />
                  {t("history.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </EditorMenu>
        ) : null
      }
    />
  );
}

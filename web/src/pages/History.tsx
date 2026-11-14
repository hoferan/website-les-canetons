import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ACTION_STRIP_ROOM, ActionBar, ActionBarList, Button } from "@ds";
import { PageSection } from "@/components/PageSection";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useHistoryEntryIndex } from "../api/generated/endpoints";
import type { HistoryEntryResource } from "../api/generated/model";
import { RAISED_CARD } from "../carnival/raised";
import { HeroBlock } from "../content/blocks/HeroBlock";
import { useEditMode } from "../content/EditMode";
import { DeleteHistoryEntry } from "../history/DeleteHistoryEntry";
import {
  dateWithPreposition,
  historyDate,
  historyDetail,
  historyYear,
  shownIn,
} from "../history/entry";
import { EntryTile } from "../history/EntryTile";
import type { HistoryDraft } from "../history/HistoryForm";
import {
  HistoryPanel,
  historyEditTarget,
  type HistoryOpened,
  PANEL_MENU,
} from "../history/HistoryPanel";
import { currentLocale, t } from "../i18n";
import { Photo, PHOTO_SIZES, type PhotoData } from "../images/Photo";
import { historySlot, usePhotoSlots } from "../images/photoSlots";

import { useSession } from "../session/SessionProvider";
import { usePageTitle } from "../components/pageTitle";

const ADD_ID = "history-add";

/** The id the page gives a new entry while it is being written, so it sorts last on its date. */
const NEW_ID = Number.MAX_SAFE_INTEGER;

/**
 * The band's history as a vertical timeline (#104).
 *
 * The committee writes it (history.manage), so its text is content and
 * renders verbatim. Each entry is shown in the page's language when it has
 * one, otherwise in the other, with `lang` on the entry's text and a note in
 * the page's language saying which. ADR 0026.
 *
 * Each entry is a raised card like every other card on the site, opening on
 * its icon tile and its year, large, the landmark a reader scans by. A short
 * cord joins one card to the next down the middle, in the gaps only, so the
 * timeline starts at the first entry and ends at the last. There is no date
 * column, because the page is text-width and a second column only narrows
 * the text.
 *
 * The controls show in edit mode only, and only with the permission: absent
 * rather than refused, like the planning's, because a link that leads to
 * "Accès refusé" reads as a broken site. In edit mode each card wears the
 * action strip every card wears (ADR 0043).
 *
 * An entry is edited in the side panel every public page edits in (#419):
 * ✎ opens it on the entry, "Ajouter" on a new one. While it is open the page
 * is its preview: the card shows what is typed, a new one appears at its
 * place on the timeline, a changed date moves it, and the page's own controls
 * go, so what shows is what a visitor would see.
 */
export function History() {
  usePageTitle(t("nav.history"));
  const { can } = useSession();
  const list = useHistoryEntryIndex();
  const entries = rowsOf<HistoryEntryResource>(list.data);
  const { on: editing } = useEditMode();
  const mayEdit = can("history.manage") && editing;
  const [opened, setOpened] = useState<HistoryOpened | null>(null);
  const [draft, setDraft] = useState<HistoryDraft | null>(null);
  const controls = mayEdit && opened === null;
  const [deleting, setDeleting] = useState<HistoryEntryResource | null>(null);
  // The entry last asked about, kept past the dialog's close for its focus.
  const asked = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  // What takes focus once the panel has closed and the page's controls are
  // back: the card's ✎, or "Ajouter" for a new entry or a deleted one.
  const returnTo = useRef<string | null>(null);

  const open = (next: HistoryOpened) => {
    setPhotoFailed(false);
    setDraft(null);
    setOpened(next);
  };
  const close = () => {
    returnTo.current =
      opened?.kind === "edit"
        ? `[data-entry-id="${opened.id}"] [data-action="edit"]`
        : `#${ADD_ID}`;
    setOpened(null);
    setDraft(null);
  };

  useEffect(() => {
    if (opened !== null || returnTo.current === null) return;
    document.querySelector<HTMLElement>(returnTo.current)?.focus();
    returnTo.current = null;
  }, [opened]);

  // The entries as the page shows them: the one being edited as typed, or a
  // new one at its date, sorted as the server sorts them.
  const rows = useMemo(() => {
    if (opened === null || draft === null) return entries;
    const fields = {
      occurredOn: draft.occurredOn,
      precision: draft.precision,
      titleFr: draft.titleFr,
      bodyFr: draft.bodyFr,
      titleDe: draft.titleDe,
      bodyDe: draft.bodyDe,
      important: draft.important,
      icon: draft.icon,
    };
    const next =
      opened.kind === "edit"
        ? entries.map((entry) => (entry.id === opened.id ? { ...entry, ...fields } : entry))
        : [...entries, { ...fields, id: NEW_ID, createdAt: "", updatedAt: "" }];
    return next.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.id - b.id);
  }, [entries, opened, draft]);
  const draftId = opened === null ? null : opened.kind === "edit" ? opened.id : NEW_ID;

  return (
    <>
      <HeroBlock blockKey="history.hero" seed={17} width="text" />

      <PageSection width="text">
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {/* The committee's tool, so it sits on the cream under the hero rather
            than on the poster with the heading a visitor reads. */}
        {controls ? (
          <div className="mb-block flex justify-end">
            <Button
              id={ADD_ID}
              type="button"
              variant="accent"
              size="sm"
              className="px-3"
              aria-label={t("history.addAria")}
              onClick={() => open({ kind: "new" })}
            >
              <Plus aria-hidden="true" />
              {t("history.add")}
            </Button>
          </div>
        ) : null}

        {photoFailed ? (
          <p role="alert" className="mb-block text-danger">
            {t("history.photoFailed")}
          </p>
        ) : null}

        {list.isPending ? <p className="text-ink-muted">{t("common.loading")}</p> : null}
        {list.isError ? (
          <p role="alert" className="text-danger">
            {t("history.loadFailed")}
          </p>
        ) : null}
        {list.isSuccess && rows.length === 0 ? (
          <p className="text-ink-muted">{t("history.empty")}</p>
        ) : null}

        {rows.length > 0 ? (
          // One column, so the strips decide together whether their words fit.
          <ActionBarList stacked>
            <ol data-testid="history-timeline" className="flex flex-col gap-block">
              {rows.map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  mayEdit={controls}
                  // As picked in the panel; undefined keeps the entry's slot.
                  photo={entry.id === draftId ? draft?.photo : undefined}
                  onEdit={() => open({ kind: "edit", id: entry.id })}
                  onDelete={() => {
                    asked.current = entry.id;
                    setDeleting(entry);
                  }}
                />
              ))}
            </ol>
          </ActionBarList>
        ) : null}

        <HistoryPanel
          opened={opened}
          onClose={close}
          onSaved={(failed) => {
            close();
            setAnnouncement(t("history.saved"));
            setPhotoFailed(failed);
          }}
          onDraft={setDraft}
          onDelete={(entry) => {
            asked.current = entry.id;
            setDeleting(entry);
          }}
        />

        <DeleteHistoryEntry
          entry={deleting}
          onClose={() => setDeleting(null)}
          // The entry and its button are gone, so focus goes to the one
          // control that is always there for an editor, once the panel the
          // delete may have been asked from has closed.
          afterDelete={() => {
            setAnnouncement(t("history.deleted"));
            if (opened === null) {
              document.getElementById(ADD_ID)?.focus();
              return;
            }
            returnTo.current = `#${ADD_ID}`;
            setOpened(null);
            setDraft(null);
          }}
          // The dialog opens from a ⋯ menu, whose item is gone by then, so
          // focus goes back to that ⋯ by hand: the panel's, or the card's.
          afterCancel={() => {
            if (asked.current === null) return;
            document
              .querySelector<HTMLElement>(
                opened === null
                  ? `[data-entry-id="${asked.current}"] [data-action="more"]`
                  : `[data-history-menu="${PANEL_MENU}"]`,
              )
              ?.focus();
          }}
        />
      </PageSection>
    </>
  );
}

function TimelineEntry({
  entry,
  mayEdit,
  photo: picked,
  onEdit,
  onDelete,
}: {
  entry: HistoryEntryResource;
  mayEdit: boolean;
  /** The photo picked in the open panel; undefined shows the entry's slot. */
  photo: PhotoData | null | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const locale = currentLocale();
  const shown = shownIn(entry, locale);
  // The entry's photo is its photo slot's; the slots are read once per page.
  const stored = usePhotoSlots().photoOf(historySlot(entry.id));
  const photo = picked === undefined ? stored : picked;
  const rowName =
    shown.title ??
    t("history.untitledEntry", {
      of: dateWithPreposition(entry.occurredOn, entry.precision, locale),
    });
  // lang goes on the entry's own text only. The date, the hidden importance
  // and the controls are page copy, and would otherwise be read in the
  // entry's language.
  const textLang = shown.fallback ? shown.lang : undefined;

  const date = historyDate(entry.occurredOn, entry.precision, locale);
  const detail = historyDetail(entry.occurredOn, entry.precision, locale);

  const text = (
    <>
      {/* The card opens on its year, large, with the month or the day
          beside it: the landmark a reader scans the timeline by. A picture
          of the date, so a screen reader skips it and hears the heading. */}
      <div aria-hidden="true" className="flex items-center gap-3">
        <EntryTile important={entry.important} icon={entry.icon} />
        <span className="flex flex-wrap items-baseline gap-x-2 text-violet">
          <span className="font-display text-3xl leading-none sm:text-4xl">
            {historyYear(entry.occurredOn)}
          </span>
          {detail ? <span className="text-sm font-bold">{detail}</span> : null}
        </span>
      </div>

      {/* The heading says the date in words before the title, so heading
          navigation reaches the landmark and an untitled entry still has a
          heading. wrap-anywhere: a pasted URL or a German compound is one
          unbroken word that pushes the page sideways at 390px. Hyphenation
          only on the title, where Bungee's wide capitals need it; on
          ragged-right text it splits ordinary words at every width. */}
      <h2 className={cn("wrap-anywhere", shown.title !== null && "mt-related")}>
        {entry.important ? <span className="sr-only">{t("history.importantPrefix")}</span> : null}
        <span className="sr-only">
          {date}
          {shown.title !== null ? ", " : null}
        </span>
        {shown.title !== null ? (
          <span
            lang={textLang}
            className={`block font-display hyphens-auto ${entry.important ? "text-xl sm:text-2xl" : "text-xl"}`}
          >
            {shown.title}
          </span>
        ) : null}
      </h2>

      {/* Described by the entry's title: no photo carries alt text. */}
      {photo ? (
        <Photo
          photo={photo}
          alt={rowName}
          sizes={PHOTO_SIZES.timeline}
          className="mt-tight h-auto w-full rounded-md"
        />
      ) : null}

      {shown.body !== null ? (
        <p lang={textLang} className="mt-tight wrap-anywhere whitespace-pre-line text-ink">
          {shown.body}
        </p>
      ) : null}

      {shown.fallback ? (
        <p className="mt-tight text-xs text-ink-muted">
          {shown.lang === "fr" ? t("history.inFrench") : t("history.inGerman")}
        </p>
      ) : null}
    </>
  );

  return (
    <li
      data-entry-id={entry.id}
      className={cn(
        "relative",
        // The cord to the next card: down the middle, in the gap only, so
        // the timeline starts at the first card and ends at the last.
        "not-last:after:absolute not-last:after:top-full not-last:after:left-1/2 not-last:after:h-block not-last:after:w-1 not-last:after:-translate-x-1/2 not-last:after:bg-ink",
      )}
    >
      {/* data-chip-scope: the card whose text edit-blocks.spec.ts checks the strip against. */}
      <Card
        data-chip-scope
        // What the open panel keeps clear of its fade.
        data-edit-block={historyEditTarget(
          entry.id === NEW_ID ? { kind: "new" } : { kind: "edit", id: entry.id },
        )}
        className={cn(RAISED_CARD, "relative gap-0 p-5", mayEdit && ACTION_STRIP_ROOM)}
      >
        {mayEdit ? (
          <EntryStrip
            name={rowName}
            missingGerman={lacksGerman(entry)}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ) : null}
        {text}
      </Card>
    </li>
  );
}

/**
 * An entry's action strip in edit mode (ADR 0043), as every card on the site
 * wears one: ⋯ ✎, with ✎ labelled. There are no arrows, because the year
 * orders the entries. ⋯ holds Supprimer, which still asks first.
 */
function EntryStrip({
  name,
  missingGerman,
  onEdit,
  onDelete,
}: {
  name: string;
  missingGerman: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const edit = t("history.editAria", { name });
  return (
    <ActionBar
      look="strip"
      label={name}
      main="edit"
      // A raised card's corner is 18px; the strip meets the inner edge of
      // its 3px border.
      className="rounded-t-[15px]"
      actions={[
        {
          id: "more",
          label: t("history.more", { name }),
          menu: [
            {
              id: "delete",
              label: t("history.delete"),
              icon: Trash2,
              destructive: true,
              onSelect: onDelete,
            },
          ],
        },
        {
          id: "edit",
          icon: Pencil,
          word: t("history.edit"),
          label: missingGerman ? t("blockEditor.missingGerman", { text: edit }) : edit,
          flag: missingGerman,
          onSelect: onEdit,
        },
      ]}
    />
  );
}

/**
 * Whether a text of the entry has French and no German. A German-only entry
 * lacks nothing: the German page shows it as it is.
 */
function lacksGerman(entry: HistoryEntryResource): boolean {
  const missing = (fr: string | null, de: string | null) =>
    (fr ?? "").trim() !== "" && (de ?? "").trim() === "";
  return missing(entry.titleFr, entry.titleDe) || missing(entry.bodyFr, entry.bodyDe);
}

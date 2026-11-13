import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ACTION_STRIP_ROOM, ActionBar, ActionBarList } from "@ds";
import { PageSection } from "@/components/PageSection";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useHistoryEntryIndex } from "../api/generated/endpoints";
import type { HistoryEntryResource } from "../api/generated/model";
import { RAISED_CARD } from "../carnival/raised";
import { HeroBlock } from "../content/blocks/HeroBlock";
import { ChipLink } from "../content/editor/EditChip";
import { useEditMode } from "../content/EditMode";
import { DeleteHistoryEntry } from "../history/DeleteHistoryEntry";
import { dateWithPreposition, historyDate, shownIn } from "../history/entry";
import { TimelineMarker } from "../history/TimelineMarker";
import { currentLocale, t } from "../i18n";
import { useNavigate } from "../i18n/routing";
import { Photo, PHOTO_SIZES } from "../images/Photo";
import { historySlot, usePhotoSlots } from "../images/photoSlots";
import { useLocation } from "react-router-dom";

import { useSession } from "../session/SessionProvider";

const ADD_ID = "history-add";

/**
 * Set by the history form on its way back here. `photoFailed` means the entry
 * saved and its photo did not, which the form cannot report itself: it has
 * closed, because saving again would write the entry twice.
 */
export type HistorySavedState = { historySaved: true; photoFailed?: boolean };

/**
 * The band's history as a vertical timeline (#104).
 *
 * The committee writes it (history.manage), so its text is content and
 * renders verbatim. Each entry is shown in the page's language when it has
 * one, otherwise in the other, with `lang` on the entry's text and a note in
 * the page's language saying which. ADR 0026.
 *
 * The date is in the heading, above the title, at every width: on a timeline
 * the year is the landmark, so heading navigation has to reach it, and an
 * untitled entry still gets a heading. There is no date column, because the
 * page is text-width and a second column only narrows the text.
 *
 * The controls show in edit mode only, and only with the permission: absent
 * rather than refused, like the planning's, because a link that leads to
 * "Accès refusé" reads as a broken site. In edit mode each entry becomes a
 * raised tile wearing an action strip (ADR 0043), as cards do.
 *
 * The longest page on the site, so the carnival look stops at the hero (ADR
 * 0029): the entries stay on plain cream, and the only colour below it is the
 * timeline's own markers.
 */
export function History() {
  const { can } = useSession();
  const list = useHistoryEntryIndex();
  const entries = rowsOf<HistoryEntryResource>(list.data);
  const { on: editing } = useEditMode();
  const mayEdit = can("history.manage") && editing;
  const [deleting, setDeleting] = useState<HistoryEntryResource | null>(null);
  // The entry last asked about, kept past the dialog's close for its focus.
  const asked = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // A save arrives as history state from the form. It is set after mount into
  // a live region that already exists, which is what gets it read out, then
  // cleared from the history entry so a reload or Back does not repeat it.
  // SeriesCreatedNotice does the same for the planning.
  useEffect(() => {
    const saved = location.state as HistorySavedState | null;
    if (saved?.historySaved !== true) {
      return;
    }
    setAnnouncement(t("history.saved"));
    setPhotoFailed(saved.photoFailed === true);
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location, navigate]);

  return (
    <>
      <HeroBlock blockKey="history.hero" seed={17} width="text" />

      <PageSection width="text">
        <p role="status" className="sr-only">
          {announcement}
        </p>
        {/* The committee's tool, so it sits on the cream under the hero rather
            than on the poster with the heading a visitor reads. */}
        {mayEdit ? (
          <div className="mb-block flex justify-end">
            <ChipLink
              to="/history/new"
              label={t("history.add")}
              ariaLabel={t("history.addAria")}
              icon={Plus}
              corner={false}
              iconFirst
              id={ADD_ID}
            />
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
        {list.isSuccess && entries.length === 0 ? (
          <p className="text-ink-muted">{t("history.empty")}</p>
        ) : null}

        {entries.length > 0 ? (
          // One column, so every strip is as wide as the text and either all
          // of their words fit or none.
          <ActionBarList stacked>
            <ol data-testid="history-timeline" className="ml-5 border-l-2 border-line">
              {entries.map((entry) => (
                <TimelineEntry
                  key={entry.id}
                  entry={entry}
                  mayEdit={mayEdit}
                  onDelete={() => {
                    asked.current = entry.id;
                    setDeleting(entry);
                  }}
                />
              ))}
            </ol>
          </ActionBarList>
        ) : null}

        <DeleteHistoryEntry
          entry={deleting}
          onClose={() => setDeleting(null)}
          // The entry and its button are gone, so focus goes to the one
          // control that is always there for an editor.
          afterDelete={() => {
            document.getElementById(ADD_ID)?.focus();
            setAnnouncement(t("history.deleted"));
          }}
          // The dialog opens from ⋯'s menu, whose item is gone by then, so
          // focus goes back to the ⋯ by hand.
          afterCancel={() => {
            if (asked.current === null) return;
            document
              .querySelector<HTMLElement>(`[data-entry-id="${asked.current}"] [data-action="more"]`)
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
  onDelete,
}: {
  entry: HistoryEntryResource;
  mayEdit: boolean;
  onDelete: () => void;
}) {
  const locale = currentLocale();
  const shown = shownIn(entry, locale);
  // The entry's photo is its photo slot's; the slots are read once per page.
  const photo = usePhotoSlots().photoOf(historySlot(entry.id));
  const rowName =
    shown.title ??
    t("history.untitledEntry", {
      of: dateWithPreposition(entry.occurredOn, entry.precision, locale),
    });
  // lang goes on the entry's own text only. The date, the hidden importance
  // and the controls are page copy, and would otherwise be read in the
  // entry's language.
  const textLang = shown.fallback ? shown.lang : undefined;
  const navigate = useNavigate();

  const text = (
    <>
      {/* wrap-anywhere: a pasted URL or a German compound is one unbroken
          word that pushes the page sideways at 390px. Hyphenation only on
          the title, where Bungee's wide capitals need it; on ragged-right
          text it splits ordinary words at every width. */}
      <h2 className="wrap-anywhere">
        {entry.important ? <span className="sr-only">{t("history.importantPrefix")}</span> : null}
        <span className="block text-sm font-semibold text-violet">
          {historyDate(entry.occurredOn, entry.precision, locale)}
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
    <li className="relative mb-block pl-8" data-entry-id={entry.id}>
      <TimelineMarker
        important={entry.important}
        icon={entry.icon}
        className={cn(
          "absolute left-0 -translate-x-[calc(50%+1px)]",
          // Level with the date, which the tile's border and strip push down.
          mayEdit ? "top-[calc(4rem+3px)]" : "top-0",
        )}
      />
      {mayEdit ? (
        // data-chip-scope: the block the strip is measured against (edit-blocks.spec.ts).
        <div data-chip-scope className={cn(RAISED_CARD, "relative p-5", ACTION_STRIP_ROOM)}>
          <EntryStrip
            name={rowName}
            missingGerman={lacksGerman(entry)}
            onEdit={() => void navigate(`/history/${entry.id}/edit`)}
            onDelete={onDelete}
          />
          {text}
        </div>
      ) : (
        text
      )}
    </li>
  );
}

/**
 * An entry's action strip in edit mode (ADR 0043): ⋯ ✎, with ✎ labelled.
 * There are no arrows, because the year orders the entries. ⋯ holds
 * Supprimer, which still asks first.
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
      // A raised card's corner is 18px; the strip meets the inner edge of
      // its 3px border.
      className="rounded-t-[15px]"
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

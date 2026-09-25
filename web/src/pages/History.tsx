import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { PageSection } from "@/components/PageSection";

import { rowsOf } from "../api/collection";
import { useHistoryEntryIndex } from "../api/generated/endpoints";
import type { HistoryEntryResource } from "../api/generated/model";
import { ButtonLink } from "../components/ButtonLink";
import { RowActions } from "../components/RowActions";
import { DeleteHistoryEntry } from "../history/DeleteHistoryEntry";
import { dateWithPreposition, historyDate, shownIn } from "../history/entry";
import { TimelineMarker } from "../history/TimelineMarker";
import { currentLocale, t } from "../i18n";
import { useLocation, useNavigate } from "react-router-dom";

import { useSession } from "../session/SessionProvider";

const ADD_ID = "history-add";

/** What the history form hands the page as it navigates back after a save. */
export type HistorySavedState = { historySaved: true };

/**
 * The band's history as a vertical timeline (#104).
 *
 * The committee writes it (history.manage), so its text is content and
 * renders verbatim. Each entry is shown in the page's language when it has
 * one, otherwise in the other, with `lang` on the entry's text and a note in
 * the page's language saying which. ADR 0026.
 *
 * THE DATE IS IN THE HEADING, above the title, at every width. On a timeline
 * the year is the landmark, so heading navigation has to reach it, and an
 * entry without a title still gets a heading. A date column beside the line
 * was considered for desktop, but the page is a text-width column, and a
 * second column only narrows the text it is there to show.
 *
 * The controls are ABSENT without the permission rather than refused, like
 * the planning's: a link that leads to "Accès refusé" teaches people that
 * parts of the site are broken for them.
 */
export function History() {
  const { can } = useSession();
  const list = useHistoryEntryIndex();
  const entries = rowsOf<HistoryEntryResource>(list.data);
  const mayEdit = can("history.manage");
  const [deleting, setDeleting] = useState<HistoryEntryResource | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const location = useLocation();
  const navigate = useNavigate();

  // A SAVE ARRIVES AS HISTORY STATE from the form, and is announced once the
  // page is here. Set after mount into a live region that already exists,
  // which is what gets it read out; then cleared from the history entry, so a
  // reload or "back" does not announce it again. SeriesCreatedNotice does the
  // same for the planning.
  useEffect(() => {
    if ((location.state as HistorySavedState | null)?.historySaved !== true) {
      return;
    }
    setAnnouncement(t("history.saved"));
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location, navigate]);

  return (
    <PageSection width="text">
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-related">
        <h1 className="font-display text-4xl">{t("history.heading")}</h1>
        {mayEdit ? (
          <ButtonLink to="/history/new" ariaLabel={t("history.addAria")} id={ADD_ID}>
            <Plus aria-hidden="true" />
            {t("history.add")}
          </ButtonLink>
        ) : null}
      </div>

      {list.isPending ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}
      {list.isError ? (
        <p role="alert" className="mt-block text-danger">
          {t("history.loadFailed")}
        </p>
      ) : null}
      {list.isSuccess && entries.length === 0 ? (
        <p className="mt-block text-ink-muted">{t("history.empty")}</p>
      ) : null}

      {entries.length > 0 ? (
        <ol data-testid="history-timeline" className="mt-block ml-5 border-l-2 border-line">
          {entries.map((entry) => (
            <TimelineEntry
              key={entry.id}
              entry={entry}
              mayEdit={mayEdit}
              onDelete={() => setDeleting(entry)}
            />
          ))}
        </ol>
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
      />
    </PageSection>
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
  const rowName =
    shown.title ??
    t("history.untitledEntry", {
      of: dateWithPreposition(entry.occurredOn, entry.precision, locale),
    });
  // LANG ON THE ENTRY'S OWN TEXT ONLY. The date, the hidden importance and
  // the controls are page copy, and a lang on the whole entry would have a
  // screen reader read them in the entry's language.
  const textLang = shown.fallback ? shown.lang : undefined;

  return (
    <li className="relative mb-block pl-8">
      <TimelineMarker
        important={entry.important}
        icon={entry.icon}
        className="absolute top-0 left-0 -translate-x-[calc(50%+1px)]"
      />

      {/* WRAP ANYWHERE: a pasted URL or a German compound is one unbroken
          word, and at 390px it pushed the whole page sideways. Hyphenation
          only on the title, where Bungee's wide capitals need it; on
          ragged-right text it split ordinary words at every width. */}
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

      {mayEdit ? (
        <div className="mt-tight">
          <RowActions
            inlineKey="edit"
            rowName={rowName}
            actions={[
              {
                key: "edit",
                label: t("history.edit"),
                ariaLabel: t("history.editAria", { name: rowName }),
                to: `/history/${entry.id}/edit`,
              },
              {
                key: "delete",
                label: t("history.delete"),
                ariaLabel: t("history.deleteAria", { name: rowName }),
                destructive: true,
                onSelect: onDelete,
              },
            ]}
          />
        </div>
      ) : null}
    </li>
  );
}

import { Plus } from "lucide-react";
import { useState } from "react";

import { PageSection } from "@/components/PageSection";

import { rowsOf } from "../api/collection";
import { useHistoryEntryIndex } from "../api/generated/endpoints";
import type { HistoryEntryResource } from "../api/generated/model";
import { ButtonLink } from "../components/ButtonLink";
import { RowActions } from "../components/RowActions";
import { DeleteHistoryEntry } from "../history/DeleteHistoryEntry";
import { historyDate, iconFor, shownIn } from "../history/entry";
import { currentLocale, t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * The band's history as a vertical timeline (#104).
 *
 * The committee writes it (history.manage), so its text is content and
 * renders verbatim. Each entry is shown in the page's language when it has
 * one, otherwise in the other, with `lang` on the entry and a note in the
 * page's language saying which. ADR 0026.
 *
 * THE DATE SITS ABOVE THE TITLE AT EVERY WIDTH. A date column beside the line
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

  return (
    <PageSection width="text">
      <div className="flex flex-wrap items-center justify-between gap-related">
        <h1 className="font-display text-4xl">{t("history.heading")}</h1>
        {mayEdit ? (
          <ButtonLink to="/history/new">
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

      <DeleteHistoryEntry entry={deleting} onClose={() => setDeleting(null)} />
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
  const Icon = iconFor(entry.icon);
  const rowName = shown.title ?? t("history.untitled");

  // The marker, centred on the line: a large pink circle for an important
  // entry, a violet circle around an icon, or a plain violet dot. Decorative;
  // importance reaches a screen reader through the hidden text below.
  const marker = entry.important
    ? "size-10 bg-pink text-ink"
    : Icon
      ? "size-8 bg-violet text-white"
      : "size-4 bg-violet";

  return (
    <li lang={shown.fallback ? shown.lang : undefined} className="relative mb-block pl-8">
      <span
        aria-hidden="true"
        className={`absolute top-0 left-0 flex -translate-x-[calc(50%+1px)] items-center justify-center rounded-full border-4 border-ground ${marker}`}
      >
        {Icon ? <Icon className={entry.important ? "size-5" : "size-4"} /> : null}
      </span>

      <p className="text-sm font-semibold text-violet">
        {historyDate(entry.occurredOn, entry.precision, locale)}
      </p>

      {shown.title !== null ? (
        <h2 className={`font-display ${entry.important ? "text-2xl" : "text-xl"}`}>
          {entry.important ? (
            <span className="sr-only">{`${t("history.important")} : `}</span>
          ) : null}
          {shown.title}
        </h2>
      ) : entry.important ? (
        <p className="sr-only">{t("history.important")}</p>
      ) : null}

      {shown.body !== null ? (
        <p className="mt-tight whitespace-pre-line text-ink">{shown.body}</p>
      ) : null}

      {shown.fallback ? (
        // In the page's language, although the entry around it is not.
        <p lang={locale} className="mt-tight text-xs text-ink-muted">
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
                ariaLabel: `${t("history.edit")} ${rowName}`,
                to: `/history/${entry.id}/edit`,
              },
              {
                key: "delete",
                label: t("history.delete"),
                ariaLabel: `${t("history.delete")} ${rowName}`,
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

import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";

import type {
  HistoryEntryResource,
  StoreHistoryEntryRequest,
  StoreHistoryEntryRequestIcon,
  StoreHistoryEntryRequestPrecision,
} from "../api/generated/model";
import { FormError, FormField, formIsValid } from "../components/FormField";
import { t, type TranslatedError } from "../i18n";
import { HISTORY_ICONS, type HistoryIconKey } from "./entry";

const PRECISIONS = ["year", "month", "day"] as const;
const ICON_KEYS = ["none", ...(Object.keys(HISTORY_ICONS) as HistoryIconKey[])] as const;

/** The two language groups, spelled out so every key is one t() knows. */
const SIDES = [
  {
    legend: "historyForm.french",
    title: { field: "titleFr", label: "fields.titleFr" },
    body: { field: "bodyFr", label: "fields.bodyFr" },
  },
  {
    legend: "historyForm.german",
    title: { field: "titleDe", label: "fields.titleDe" },
    body: { field: "bodyDe", label: "fields.bodyDe" },
  },
] as const;

type Draft = {
  occurredOn: string;
  precision: string;
  titleFr: string;
  bodyFr: string;
  titleDe: string;
  bodyDe: string;
  important: boolean;
  icon: string;
};

function draftFrom(entry: HistoryEntryResource | null): Draft {
  return {
    occurredOn: entry?.occurredOn ?? "",
    precision: entry?.precision ?? "year",
    titleFr: entry?.titleFr ?? "",
    bodyFr: entry?.bodyFr ?? "",
    titleDe: entry?.titleDe ?? "",
    bodyDe: entry?.bodyDe ?? "",
    important: entry?.important ?? false,
    icon: entry?.icon ?? "none",
  };
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/**
 * One history entry, new or edited.
 *
 * NO TEXT FIELD IS MARKED REQUIRED, because none is on its own: the rule is
 * that at least one of the four is filled. It is checked here before sending,
 * so the refusal is in the page's language and focus lands on the first text
 * field (#209), and again on the server, which answers history_entry_empty.
 */
export function HistoryForm({
  entry,
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  entry: HistoryEntryResource | null;
  busy: boolean;
  error: TranslatedError | null;
  problemFor: (field: string) => string | undefined;
  onSubmit: (body: StoreHistoryEntryRequest) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(entry));
  const [localError, setLocalError] = useState<TranslatedError | null>(null);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setLocalError(null);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !formIsValid(event.currentTarget)) {
      return;
    }
    const texts = [draft.titleFr, draft.bodyFr, draft.titleDe, draft.bodyDe];
    if (texts.every((value) => value.trim() === "")) {
      setLocalError({ message: t("errors.history_entry_empty"), fields: [] });
      document.getElementById("titleFr")?.focus();
      return;
    }
    onSubmit({
      occurredOn: draft.occurredOn,
      precision: draft.precision as StoreHistoryEntryRequestPrecision,
      titleFr: orNull(draft.titleFr),
      bodyFr: orNull(draft.bodyFr),
      titleDe: orNull(draft.titleDe),
      bodyDe: orNull(draft.bodyDe),
      important: draft.important,
      icon: draft.icon === "none" ? null : (draft.icon as StoreHistoryEntryRequestIcon),
    });
  }

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
    >
      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="occurredOn"
          type="date"
          label={t("fields.occurredOn")}
          value={draft.occurredOn}
          onChange={(value) => set("occurredOn", value)}
          problem={problemFor("occurredOn")}
          required
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="precision">{t("fields.precision")}</label>
          <select
            id="precision"
            className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
            value={draft.precision}
            onChange={(changed) => set("precision", changed.target.value)}
          >
            {PRECISIONS.map((precision) => (
              <option key={precision} value={precision}>
                {t(`historyForm.precisions.${precision}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {SIDES.map((side) => (
        <fieldset key={side.legend} className="flex flex-col gap-related">
          <legend className="font-semibold">{t(side.legend)}</legend>
          <FormField
            id={side.title.field}
            label={t(side.title.label)}
            value={draft[side.title.field]}
            onChange={(value) => set(side.title.field, value)}
            problem={problemFor(side.title.field)}
          />
          <FormField
            id={side.body.field}
            as="textarea"
            label={t(side.body.label)}
            value={draft[side.body.field]}
            onChange={(value) => set(side.body.field, value)}
            problem={problemFor(side.body.field)}
          />
        </fieldset>
      ))}
      <p className="text-sm text-ink-muted">{t("historyForm.atLeastOne")}</p>

      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.important}
          onChange={(changed) => set("important", changed.target.checked)}
        />
        {t("fields.important")}
      </label>

      <fieldset className="flex flex-col gap-tight">
        <legend>{t("historyForm.iconLegend")}</legend>
        <div className="flex flex-wrap gap-tight">
          {ICON_KEYS.map((key) => {
            const Icon = key === "none" ? null : HISTORY_ICONS[key];
            return (
              <label
                key={key}
                className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line text-ink focus-within:ring-2 focus-within:ring-violet has-checked:border-violet has-checked:bg-violet has-checked:text-white"
              >
                <input
                  type="radio"
                  name="icon"
                  value={key}
                  className="sr-only"
                  checked={draft.icon === key}
                  onChange={() => set("icon", key)}
                />
                <span className="sr-only">{t(`history.icons.${key}`)}</span>
                {Icon ? (
                  <Icon aria-hidden="true" className="size-5" />
                ) : (
                  <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <FormError error={error ?? localError} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

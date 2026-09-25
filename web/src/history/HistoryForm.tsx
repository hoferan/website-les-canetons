import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";

import type {
  HistoryEntryResource,
  StoreHistoryEntryRequest,
  StoreHistoryEntryRequestIcon,
  StoreHistoryEntryRequestPrecision,
} from "../api/generated/model";
import {
  FormError,
  FormField,
  RequiredLegend,
  RequiredMark,
  formIsValid,
} from "../components/FormField";
import { currentLocale, t, type TranslatedError } from "../i18n";
import { intlTag } from "../i18n/locale";
import { HISTORY_ICONS, type HistoryIconKey, historyDate, iconFor } from "./entry";
import { TimelineMarker } from "./TimelineMarker";

const PRECISIONS = ["year", "month", "day"] as const;
type Precision = (typeof PRECISIONS)[number];
const ICON_KEYS = ["none", ...(Object.keys(HISTORY_ICONS) as HistoryIconKey[])] as const;
type IconChoice = (typeof ICON_KEYS)[number];
const TITLE_MAX = 120;

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

const RULE_ID = "history-rule";
const MONTH_ERROR_ID = "occurredMonth-error";

type Draft = {
  precision: Precision;
  year: string;
  month: string;
  day: string;
  titleFr: string;
  bodyFr: string;
  titleDe: string;
  bodyDe: string;
  important: boolean;
  icon: IconChoice;
};

function draftFrom(entry: HistoryEntryResource | null): Draft {
  const precision = (PRECISIONS as readonly string[]).includes(entry?.precision ?? "")
    ? (entry?.precision as Precision)
    : "year";
  const on = entry?.occurredOn ?? "";
  return {
    precision,
    year: on.slice(0, 4),
    // The parts the entry does not know stay empty rather than inherit the
    // 01 its stored date was truncated to, so switching a year entry to an
    // exact date never offers the first of January as if it were known.
    month: precision === "year" ? "" : on.slice(5, 7),
    day: precision === "day" ? on : "",
    titleFr: entry?.titleFr ?? "",
    bodyFr: entry?.bodyFr ?? "",
    titleDe: entry?.titleDe ?? "",
    bodyDe: entry?.bodyDe ?? "",
    important: entry?.important ?? false,
    // An icon this bundle does not know opens as none, like the timeline's dot.
    icon: entry?.icon && iconFor(entry.icon) ? (entry.icon as HistoryIconKey) : "none",
  };
}

/** The date the entry will carry, or null while the controls are incomplete. */
function occurredOn(draft: Draft): string | null {
  const year = /^\d{4}$/.test(draft.year) ? draft.year : null;
  if (draft.precision === "year") {
    return year ? `${year}-01-01` : null;
  }
  if (draft.precision === "month") {
    return year && draft.month !== "" ? `${year}-${draft.month}-01` : null;
  }
  return draft.day !== "" ? draft.day : null;
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

function monthNames(): string[] {
  const format = new Intl.DateTimeFormat(intlTag(currentLocale()), {
    month: "long",
    timeZone: "UTC",
  });
  return Array.from({ length: 12 }, (_, index) =>
    format.format(new Date(Date.UTC(2000, index, 1))),
  );
}

/**
 * One history entry, new or edited.
 *
 * THE PRECISION COMES FIRST, AND DECIDES WHAT IS ASKED FOR: a year entry asks
 * for a year, a month entry for a month and a year, an exact date for a date.
 * A single date field for all three made the committee invent a day for
 * "2007", which the server then dropped and the next edit showed as 01.01.
 * The preview prints the date as the timeline will.
 *
 * NO TEXT FIELD IS MARKED REQUIRED, because none is on its own: at least one
 * of the four is. The rule sits above the fields and describes each of them,
 * and when it is broken the message appears in the same place and marks all
 * four, with focus on the first. It is checked here before sending, so the
 * refusal is in the page's language (#209), and again on the server, which
 * answers history_entry_empty.
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
  const [empty, setEmpty] = useState(false);
  const [yearProblem, setYearProblem] = useState<string | undefined>(undefined);
  const [monthProblem, setMonthProblem] = useState<string | undefined>(undefined);
  const locale = currentLocale();

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setEmpty(false);
    setYearProblem(undefined);
    setMonthProblem(undefined);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /**
   * SWITCHING THE PRECISION KEEPS WHAT IS KNOWN. Narrowing an exact date takes
   * its year and month from it; widening back to an exact date keeps a day
   * only if it still agrees with the year and month, and never invents one.
   */
  function changePrecision(next: Precision) {
    setEmpty(false);
    setYearProblem(undefined);
    setMonthProblem(undefined);
    setDraft((current) => {
      let { year, month, day } = current;
      if (current.precision === "day" && day !== "") {
        year = day.slice(0, 4);
        month = day.slice(5, 7);
      }
      if (next === "day" && current.precision !== "day" && day !== "") {
        const agrees =
          day.slice(0, 4) === year && (current.precision === "year" || day.slice(5, 7) === month);
        if (!agrees) {
          day = "";
        }
      }
      return { ...current, precision: next, year, month, day };
    });
  }

  const date = occurredOn(draft);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }
    // BEFORE formIsValid, which would focus the select and say nothing: the
    // select is not a FormField, so no message of the browser reaches it.
    if (draft.precision === "month" && draft.month === "") {
      setMonthProblem(t("historyForm.monthMissing"));
      document.getElementById("occurredMonth")?.focus();
      return;
    }
    if (!formIsValid(event.currentTarget)) {
      return;
    }
    if (draft.precision !== "day" && !/^\d{4}$/.test(draft.year)) {
      setYearProblem(t("historyForm.yearInvalid"));
      document.getElementById("occurredYear")?.focus();
      return;
    }
    const texts = [draft.titleFr, draft.bodyFr, draft.titleDe, draft.bodyDe];
    if (texts.every((value) => value.trim() === "")) {
      setEmpty(true);
      document.getElementById("titleFr")?.focus();
      return;
    }
    if (date === null) {
      return;
    }
    onSubmit({
      occurredOn: date,
      precision: draft.precision as StoreHistoryEntryRequestPrecision,
      titleFr: orNull(draft.titleFr),
      bodyFr: orNull(draft.bodyFr),
      titleDe: orNull(draft.titleDe),
      bodyDe: orNull(draft.bodyDe),
      important: draft.important,
      icon: draft.icon === "none" ? null : (draft.icon as StoreHistoryEntryRequestIcon),
    });
  }

  const textDescription = RULE_ID;
  const selectClass = "focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink";

  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
    >
      <RequiredLegend />
      <div className="flex flex-col gap-1">
        <label htmlFor="precision">{t("fields.precision")}</label>
        <select
          id="precision"
          className={selectClass}
          value={draft.precision}
          onChange={(changed) => changePrecision(changed.target.value as Precision)}
        >
          {PRECISIONS.map((precision) => (
            <option key={precision} value={precision}>
              {t(`historyForm.precisions.${precision}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-related sm:grid-cols-2">
        {draft.precision === "day" ? (
          <FormField
            id="occurredOn"
            type="date"
            label={t("fields.occurredOn")}
            value={draft.day}
            onChange={(value) => set("day", value)}
            problem={problemFor("occurredOn")}
            required
          />
        ) : (
          <>
            {draft.precision === "month" ? (
              <div className="flex flex-col gap-1">
                <div>
                  <label htmlFor="occurredMonth">{t("historyForm.month")}</label> <RequiredMark />
                </div>
                <select
                  id="occurredMonth"
                  required
                  aria-invalid={monthProblem ? true : undefined}
                  aria-describedby={monthProblem ? MONTH_ERROR_ID : undefined}
                  className={`${selectClass} ${monthProblem ? "border-danger" : ""}`}
                  value={draft.month}
                  onChange={(changed) => set("month", changed.target.value)}
                >
                  <option value="" disabled>
                    {t("historyForm.monthPlaceholder")}
                  </option>
                  {monthNames().map((name, index) => (
                    <option key={name} value={String(index + 1).padStart(2, "0")}>
                      {name}
                    </option>
                  ))}
                </select>
                {monthProblem ? (
                  <span id={MONTH_ERROR_ID} className="block text-sm text-danger">
                    {monthProblem}
                  </span>
                ) : null}
              </div>
            ) : null}
            <FormField
              id="occurredYear"
              inputMode="numeric"
              label={t("historyForm.year")}
              value={draft.year}
              onChange={(value) => set("year", value)}
              problem={yearProblem ?? problemFor("occurredOn")}
              required
            />
          </>
        )}
      </div>

      <p className="flex items-center gap-tight text-sm text-ink-muted">
        {t("historyForm.preview")}
        <span data-testid="history-preview" className="flex items-center gap-tight">
          <TimelineMarker
            important={draft.important}
            icon={draft.icon === "none" ? null : draft.icon}
          />
          <span className="font-semibold text-violet">
            {date ? historyDate(date, draft.precision, locale) : t("historyForm.previewIncomplete")}
          </span>
        </span>
      </p>

      {/* ONE ELEMENT FOR THE RULE AND ITS BREACH: when the four texts are
          empty the rule itself turns into the error, rather than a second
          message saying nearly the same one line below. It describes each of
          the four fields, and focus moves to the first, which reads it. */}
      <p id={RULE_ID} className={`text-sm ${empty ? "text-danger" : "text-ink-muted"}`}>
        {empty ? t("errors.history_entry_empty") : t("historyForm.atLeastOne")}
      </p>

      {SIDES.map((side) => (
        <fieldset key={side.legend} className="flex flex-col gap-related">
          <legend className="font-semibold">{t(side.legend)}</legend>
          <FormField
            id={side.title.field}
            label={t(side.title.label)}
            value={draft[side.title.field]}
            onChange={(value) => set(side.title.field, value)}
            problem={problemFor(side.title.field)}
            describedBy={textDescription}
            invalid={empty}
            maxLength={TITLE_MAX}
            hint={
              <>
                <span aria-hidden="true" data-testid={`${side.title.field}-count`}>
                  {draft[side.title.field].length} / {TITLE_MAX}
                </span>
                <span className="sr-only">
                  {t("historyForm.counter", {
                    n: draft[side.title.field].length,
                    max: TITLE_MAX,
                  })}
                </span>
              </>
            }
          />
          <FormField
            id={side.body.field}
            as="textarea"
            label={t(side.body.label)}
            value={draft[side.body.field]}
            onChange={(value) => set(side.body.field, value)}
            problem={problemFor(side.body.field)}
            describedBy={textDescription}
            invalid={empty}
          />
        </fieldset>
      ))}

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
        <legend>
          {t("historyForm.iconLegend")}
          {/* The chosen icon's name, for a sighted user; each radio carries
              its own name for a screen reader, which this would repeat. */}
          <span aria-hidden="true" className="text-ink-muted">
            {t("historyForm.labelSeparator")}
            <span data-testid="icon-chosen">{t(`history.icons.${draft.icon}`)}</span>
          </span>
        </legend>
        <div className="flex flex-wrap gap-tight">
          {ICON_KEYS.map((key) => {
            const Icon = key === "none" ? null : HISTORY_ICONS[key];
            const name = t(`history.icons.${key}`);
            return (
              // RING OFFSET, because the checked circle is filled with the
              // same violet as the ring: without the gap, focus on the
              // selected icon, which is where focus nearly always is, was
              // invisible.
              <label
                key={key}
                title={name}
                className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line text-ink focus-within:ring-2 focus-within:ring-violet focus-within:ring-offset-2 focus-within:ring-offset-panel has-checked:border-violet has-checked:bg-violet has-checked:text-white"
              >
                <input
                  type="radio"
                  name="icon"
                  value={key}
                  className="sr-only"
                  checked={draft.icon === key}
                  onChange={() => set("icon", key)}
                />
                <span className="sr-only">{name}</span>
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

      <FormError error={error} />

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

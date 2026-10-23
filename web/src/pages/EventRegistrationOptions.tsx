import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { rowsOf } from "../api/collection";
import {
  registrationOptionIndex,
  registrationOptionReplace,
  useEventShow,
} from "../api/generated/endpoints";
import type {
  OptionKind,
  RegistrationOptionResource,
  ReplaceRegistrationOptionsRequestOptionsItem,
} from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField, RequiredLegend } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { formatEventWhen } from "../events/formatEventWhen";
import { t } from "../i18n";
import { francsInput, parseFrancs } from "../money";
import { OUTLINED_CARD } from "../carnival/raised";

/** One answer of a choice, as typed. */
type AnswerDraft = {
  /** The server's id, sent back so bookings keep pointing at it; null for a new one. */
  id: string | null;
  label: string;
  /** A stable key for React, since a new answer has no id. */
  key: string;
};

/** One block of the editor: an existing one, or one being invented. */
type Draft = {
  /** Null for a row that does not exist on the server yet. */
  id: number | null;
  /** Fixed once the row exists: the server refuses changing a booked block's kind. */
  kind: OptionKind;
  label: string;
  /** Help text, or a paragraph's body. */
  description: string;
  required: boolean;
  /** Quantities only. */
  countsGuests: boolean;
  /** Francs as typed, not centimes: see web/src/money.ts. */
  price: string;
  /** Whole places as typed; empty is no limit. */
  capacity: string;
  /** Places still free, as the server last counted; null without a capacity. */
  remaining: number | null;
  /** Choices only. */
  answers: AnswerDraft[];
  /** A stable key for React, since a new row has no id. */
  key: string;
};

/** The kinds in the order the add buttons offer them. */
const KINDS: OptionKind[] = ["quantity", "text", "choice", "yes_no", "heading", "paragraph"];

let nextKey = 0;

function answerDraft(id: string | null, label: string): AnswerDraft {
  return { id, label, key: `answer-${nextKey++}` };
}

function draftFrom(option: RegistrationOptionResource): Draft {
  return {
    id: option.id,
    kind: option.kind,
    label: option.label ?? "",
    description: option.description ?? "",
    required: option.required,
    countsGuests: option.countsGuests,
    price: francsInput(option.priceCents),
    capacity: option.capacity === null ? "" : String(option.capacity),
    remaining: option.remaining,
    answers: option.answers.map((answer) => answerDraft(answer.id, answer.label)),
    key: `option-${option.id}`,
  };
}

function blankDraft(kind: OptionKind): Draft {
  return {
    id: null,
    kind,
    label: "",
    description: "",
    required: false,
    // A new quantity is a menu until the committee says otherwise, as every
    // option was before the kinds existed.
    countsGuests: kind === "quantity",
    price: "",
    capacity: "",
    remaining: null,
    // Two empty answers, the fewest a choice can have.
    answers: kind === "choice" ? [answerDraft(null, ""), answerDraft(null, "")] : [],
    key: `new-${nextKey++}`,
  };
}

/** Whether the guest answers this kind, as opposed to only reading it. */
function isInput(kind: OptionKind): boolean {
  return kind !== "heading" && kind !== "paragraph";
}

/**
 * What the API takes for one row, by kind. Price, capacity and the
 * counts-as-people tick go with a quantity only, and the answers with a
 * choice only: the API refuses them anywhere else.
 */
function payloadOf(
  row: Draft,
  index: number,
  price: number | null,
  capacity: number | null,
): ReplaceRegistrationOptionsRequestOptionsItem {
  const common: ReplaceRegistrationOptionsRequestOptionsItem = {
    id: row.id,
    kind: row.kind,
    label: row.label.trim() === "" ? null : row.label,
    description: row.description.trim() === "" ? null : row.description,
    sortOrder: index,
  };

  if (!isInput(row.kind)) {
    return common;
  }
  if (row.kind === "quantity") {
    return {
      ...common,
      required: row.required,
      countsGuests: row.countsGuests,
      priceCents: price,
      capacity,
    };
  }
  if (row.kind === "choice") {
    return {
      ...common,
      required: row.required,
      // A blank answer is dropped, as the check in save() already ignores it:
      // sent, the API would refuse its label against a field no row shows.
      answers: row.answers
        .filter((answer) => answer.label.trim() !== "")
        .map((answer) => ({ id: answer.id, label: answer.label })),
    };
  }

  return { ...common, required: row.required };
}

/** Empty is no limit; anything else must be a whole number of at least 1. */
function parseCapacity(typed: string): number | null | "invalid" {
  const trimmed = typed.trim();

  if (trimmed === "") {
    return null;
  }

  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 ? Number(trimmed) : "invalid";
}

/**
 * What can be booked at one event.
 *
 * Gated on `events.manage`, not a registration permission: configuring what
 * an event offers is configuring the event. The registration permissions are
 * about the people who booked.
 *
 * Replace-all, like `PUT /members/{member}/roles`: the whole list is sent
 * every time (an entry with an id updates, one without creates, anything
 * missing is deleted), because an "add one" API cannot express removal.
 * Removing an option people have already booked is refused.
 *
 * The list is read once, imperatively, and the tag is kept: a `useQuery`
 * refetch would advance the tag while the form still shows what it opened
 * with, which satisfies the server and protects nobody.
 *
 * The write has its own facet, `etag:event.options`. The options are absent
 * from EventResource, so the event's tag would miss every option change and
 * refuse an options edit because somebody corrected the dress code.
 */
export function EventRegistrationOptions() {
  const { id } = useParams();
  const eventId = Number(id);

  const event = useEventShow(eventId);

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [etag, setEtag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [priceProblems, setPriceProblems] = useState<Record<string, string>>({});
  const [capacityProblems, setCapacityProblems] = useState<Record<string, string>>({});
  const [answerProblems, setAnswerProblems] = useState<Record<string, string>>({});
  // Beside the button, not in a toast: a toast is gone by the time somebody
  // looks up from the form.
  const [saved, setSaved] = useState(false);

  const form = useApiFormError(t("registrationOptions.saveFailed"));

  const replace = useMutation({
    mutationFn: ({
      options,
      tag,
    }: {
      options: ReplaceRegistrationOptionsRequestOptionsItem[];
      tag: string;
    }) => registrationOptionReplace(eventId, { options }, ifMatch(tag)),
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await registrationOptionIndex(eventId);
        if (cancelled) {
          return;
        }
        setDrafts(rowsOf<RegistrationOptionResource>(response).map(draftFrom));
        setEtag(entityTagOf(response));
      } catch {
        if (!cancelled) {
          setReadError(t("registrationOptions.loadFailedReload"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  function update(key: string, patch: Partial<Draft>) {
    // Any edit retracts the confirmation, which would otherwise describe a
    // list that has since changed.
    setSaved(false);
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function move(index: number, by: -1 | 1) {
    setDrafts((current) => {
      const next = [...current];
      const row = next[index];
      const swap = next[index + by];
      // Reading both rows is the bounds check: noUncheckedIndexedAccess makes
      // each `Draft | undefined`.
      if (!row || !swap) {
        return current;
      }
      next[index] = swap;
      next[index + by] = row;
      return next;
    });
  }

  async function save() {
    if (etag === null) {
      setReadError(t("registrationOptions.loadFailedReload"));
      return;
    }

    form.clear();

    // Prices and capacities are parsed before anything is sent, so a
    // malformed one is reported against its row. The API takes integer
    // centimes, so the typed price never reaches it.
    const problems: Record<string, string> = {};
    const capacityFaults: Record<string, string> = {};
    const answerFaults: Record<string, string> = {};
    const options: ReplaceRegistrationOptionsRequestOptionsItem[] = [];

    drafts.forEach((row, index) => {
      const quantity = row.kind === "quantity";
      const price = quantity ? parseFrancs(row.price) : null;
      const capacity = quantity ? parseCapacity(row.capacity) : null;

      if (price === "invalid") {
        problems[row.key] = t("registrationOptions.priceInvalid");
      }
      if (capacity === "invalid") {
        capacityFaults[row.key] = t("registrationOptions.capacityInvalid");
      }
      // The API's own rule, checked here so the row is marked before a
      // round trip. An answer left blank does not count.
      if (row.kind === "choice" && row.answers.filter((a) => a.label.trim() !== "").length < 2) {
        answerFaults[row.key] = t("registrationOptions.tooFewAnswers");
      }
      if (price === "invalid" || capacity === "invalid" || answerFaults[row.key]) {
        return;
      }

      options.push(payloadOf(row, index, price, capacity));
    });

    setPriceProblems(problems);
    setCapacityProblems(capacityFaults);
    setAnswerProblems(answerFaults);
    if (
      Object.keys(problems).length > 0 ||
      Object.keys(capacityFaults).length > 0 ||
      Object.keys(answerFaults).length > 0
    ) {
      return;
    }

    try {
      const written = await replace.mutateAsync({ options, tag: etag });

      // The write hands back the new list and tag, so a second save does not
      // quote a stale tag and get a 412 for this screen's own edit.
      setDrafts(rowsOf<RegistrationOptionResource>(written).map(draftFrom));
      setEtag(entityTagOf(written));
      setSaved(true);
    } catch (thrown) {
      // The form stays as it is: a refused save (a booked option removed, or
      // a stale tag) must not throw away the rest of the edit.
      form.setFromThrown(thrown);
    }
  }

  const title = event.data?.status === 200 ? event.data.data : null;

  return (
    <PageSection>
      <Link to="/events" className="text-sm text-ink-muted underline">
        {t("common.backToPlanning")}
      </Link>

      {/* The same key as the planning's link to this screen. */}
      <h1 className="mt-tight font-display text-3xl">{t("events.options")}</h1>

      {title ? (
        <p data-testid="options-event" className="mt-tight text-ink-muted">
          {title.title} — {formatEventWhen(title.startsAt, title.endsAt)}
        </p>
      ) : null}

      <p className="mt-related text-ink-muted">{t("registrationOptions.intro")}</p>

      {loading ? <p className="mt-block text-ink-muted">{t("common.loading")}</p> : null}

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {!loading && !readError ? (
        <>
          {drafts.length === 0 ? (
            <p className="mt-block text-ink-muted">{t("registrationOptions.empty")}</p>
          ) : (
            <div className="mt-related">
              <RequiredLegend />
            </div>
          )}

          <ul className="mt-block grid gap-related">
            {drafts.map((row, index) => (
              <li key={row.key} className={`${OUTLINED_CARD} flex flex-col gap-related p-4`}>
                {/* Numbered, because the same labels repeat per block, and
                    named by kind, because the fields differ. The number is the
                    position, which is also what `sortOrder` is sent as. */}
                <h2 className="font-display text-lg">
                  {t("registrationOptions.blockHeading", {
                    n: index + 1,
                    kind: t(`registrationOptions.kinds.${row.kind}`),
                  })}
                </h2>

                <FormField
                  id={`label-${row.key}`}
                  label={t("registrationOptions.label")}
                  value={row.label}
                  onChange={(value) => update(row.key, { label: value })}
                  // The full path, index and all: `translateApiError` keeps
                  // `field` as sent (`options.2.label`), so a bare "label"
                  // would light every row at once.
                  problem={form.messageFor(`options.${index}.label`)}
                  // A paragraph may go without a title.
                  required={row.kind !== "paragraph"}
                />
                {row.kind === "heading" ? null : (
                  <FormField
                    id={`description-${row.key}`}
                    label={
                      row.kind === "paragraph"
                        ? t("registrationOptions.body")
                        : t("registrationOptions.description")
                    }
                    as={row.kind === "paragraph" ? "textarea" : "input"}
                    maxLength={2000}
                    value={row.description}
                    onChange={(value) => update(row.key, { description: value })}
                    problem={form.messageFor(`options.${index}.description`)}
                    required={row.kind === "paragraph"}
                  />
                )}

                {row.kind === "quantity" ? (
                  <>
                    <FormField
                      id={`price-${row.key}`}
                      label={t("registrationOptions.price")}
                      value={row.price}
                      onChange={(value) => update(row.key, { price: value })}
                      // The local parse failure first: when it fires, nothing
                      // was sent.
                      problem={
                        priceProblems[row.key] ?? form.messageFor(`options.${index}.priceCents`)
                      }
                    />
                    <FormField
                      id={`capacity-${row.key}`}
                      label={t("registrationOptions.capacity")}
                      value={row.capacity}
                      inputMode="numeric"
                      onChange={(value) => update(row.key, { capacity: value })}
                      // The count is the one the screen opened with, or the
                      // last save's: it does not follow bookings made
                      // meanwhile.
                      hint={
                        row.remaining === null
                          ? t("registrationOptions.capacityHint")
                          : t("registrationOptions.capacityRemaining", { count: row.remaining })
                      }
                      problem={
                        capacityProblems[row.key] ?? form.messageFor(`options.${index}.capacity`)
                      }
                    />
                    <Toggle
                      id={`counts-${row.key}`}
                      label={t("registrationOptions.countsGuests")}
                      hint={t("registrationOptions.countsGuestsHint")}
                      checked={row.countsGuests}
                      onChange={(checked) => update(row.key, { countsGuests: checked })}
                    />
                  </>
                ) : null}

                {row.kind === "choice" ? (
                  <AnswersEditor
                    row={row}
                    problem={answerProblems[row.key] ?? form.messageFor(`options.${index}.answers`)}
                    onChange={(answers) => update(row.key, { answers })}
                  />
                ) : null}

                {isInput(row.kind) ? (
                  <Toggle
                    id={`required-${row.key}`}
                    label={t("registrationOptions.required")}
                    checked={row.required}
                    onChange={(checked) => update(row.key, { required: checked })}
                  />
                ) : null}

                {/* Icon-only, so the aria-label carries the option and a
                    screen reader hears which row moves. Remove sits at the far
                    end, away from the arrows. See ADR 0025. */}
                <div className="flex gap-tight">
                  <Button
                    type="button"
                    variant="raised-light"
                    size="icon"
                    aria-label={t("registrationOptions.moveUp", {
                      option: row.label || t("registrationOptions.thisOption"),
                    })}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="raised-light"
                    size="icon"
                    aria-label={t("registrationOptions.moveDown", {
                      option: row.label || t("registrationOptions.thisOption"),
                    })}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  {/* Removing is local until the save: the write is
                      replace-all, so the row is absent from the list sent. The
                      server refuses removing a booked option; this screen
                      keeps no copy of that rule. */}
                  <Button
                    type="button"
                    variant="raised-light"
                    size="icon"
                    className="ml-auto"
                    aria-label={t("registrationOptions.remove", {
                      option: row.label || t("registrationOptions.thisOption"),
                    })}
                    onClick={() =>
                      setDrafts((current) => current.filter((other) => other.key !== row.key))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <FormError error={form.error} />

          {/* One button per kind rather than a menu: six choices fit, and a
              committee member sees at once what a form can hold. */}
          <div
            role="group"
            aria-labelledby="add-block"
            className="mt-block flex flex-wrap items-center gap-tight"
          >
            <span id="add-block" className="w-full text-sm text-ink-muted">
              {t("registrationOptions.addBlock")}
            </span>
            {KINDS.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="raised-light"
                onClick={() => {
                  setSaved(false);
                  setDrafts((current) => [...current, blankDraft(kind)]);
                }}
              >
                <Plus aria-hidden="true" />
                {t(`registrationOptions.kinds.${kind}`)}
              </Button>
            ))}
          </div>

          <div className="mt-block flex flex-wrap gap-related">
            {saved ? (
              <p role="status" className="self-center text-ink-muted">
                {t("registrationOptions.saved")}
              </p>
            ) : null}
            <Button
              type="button"
              aria-disabled={replace.isPending}
              onClick={() => {
                if (replace.isPending) {
                  return;
                }
                void save();
              }}
            >
              {replace.isPending ? t("registrationOptions.saving") : t("common.save")}
            </Button>
          </div>
        </>
      ) : null}
    </PageSection>
  );
}

/** A setting of one block, as a switch with its label beside it. */
function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-touch items-center gap-2">
        <Switch
          id={id}
          checked={checked}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onCheckedChange={onChange}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {hint ? (
        <span id={`${id}-hint`} className="text-sm text-ink-muted">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A choice's answers, each a field of its own, in the order the guest sees
 * them.
 *
 * An answer keeps its server id through a rename, which is what keeps the
 * bookings that picked it pointing at it. Removing one somebody picked is
 * refused by the server, as removing a booked option is.
 */
function AnswersEditor({
  row,
  problem,
  onChange,
}: {
  row: Draft;
  problem: string | undefined;
  onChange: (answers: AnswerDraft[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-tight">
      <legend className="mb-tight text-sm font-semibold">{t("registrationOptions.answers")}</legend>
      {row.answers.map((answer, position) => (
        // A grid, so the remove button stays beside its field at 390px
        // instead of wrapping under it.
        <div key={answer.key} className="grid grid-cols-[1fr_auto] items-end gap-tight">
          <FormField
            id={`answer-${answer.key}`}
            label={t("registrationOptions.answerNumber", { n: position + 1 })}
            value={answer.label}
            maxLength={255}
            onChange={(value) =>
              onChange(
                row.answers.map((other) =>
                  other.key === answer.key ? { ...other, label: value } : other,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="raised-light"
            size="icon"
            aria-label={t("registrationOptions.removeAnswer", { n: position + 1 })}
            onClick={() => onChange(row.answers.filter((other) => other.key !== answer.key))}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ))}
      {problem ? (
        <span className="text-sm text-danger" role="alert">
          {problem}
        </span>
      ) : null}
      <Button
        type="button"
        variant="raised-light"
        className="w-fit"
        // Twenty is the API's cap.
        aria-disabled={row.answers.length >= 20}
        onClick={() => {
          if (row.answers.length >= 20) {
            return;
          }
          onChange([...row.answers, answerDraft(null, "")]);
        }}
      >
        <Plus aria-hidden="true" />
        {t("registrationOptions.addAnswer")}
      </Button>
    </fieldset>
  );
}

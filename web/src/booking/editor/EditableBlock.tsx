import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState, type DragEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { OUTLINED_CARD, RAISED_CARD } from "../../carnival/raised";
import { FormField } from "../../components/FormField";
import { t } from "../../i18n";
import { BlockView } from "../BlockView";
import { answerDraft, isInput, previewOf, type AnswerDraft, type Draft } from "./drafts";
import { KindSticker } from "./kinds";

/** What a failed save said about one block, by field. */
export type BlockProblems = Partial<
  Record<"label" | "description" | "price" | "capacity" | "answers", string>
>;

/** A block's name for the controls that act on it. */
export function nameOf(row: Draft): string {
  return row.label.trim() === "" ? t("registrationOptions.thisOption") : row.label;
}

/**
 * One block of the form in the editor.
 *
 * Closed, it is the guest's view of the block and nothing else, with a button
 * over it that opens it. Open, the guest's view stays on top, following every
 * keystroke, and the block's settings sit under it, in place: the same on a
 * phone and a desktop, with no side panel (#319).
 *
 * The guest's view is `inert` in the editor, so its inputs neither take
 * focus nor sit in the tab order between the controls that do something.
 * Seen as a guest, it is the real form, to try out.
 */
export function EditableBlock({
  row,
  position,
  open,
  guest,
  first,
  last,
  problems,
  onOpen,
  onClose,
  onChange,
  onMove,
  onRemove,
  onDragStart,
}: {
  row: Draft;
  /** Where the block sits, which also makes its inputs' ids unique. */
  position: number;
  open: boolean;
  /** Seen as a guest: the block alone, with no editing control. */
  guest: boolean;
  first: boolean;
  last: boolean;
  problems: BlockProblems;
  onOpen: () => void;
  onClose: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
}) {
  // What the guest's view holds while somebody tries it out. Never sent.
  const [tried, setTried] = useState("");
  // Ids the real form never uses, so the preview's label points at its own
  // input even when the same block shows twice.
  const preview = previewOf(row, -1 - position);
  const view = <BlockView option={preview} value={tried} onChange={setTried} />;

  if (guest) {
    return view;
  }

  const name = nameOf(row);

  return (
    <div
      className={cn(
        open ? RAISED_CARD : OUTLINED_CARD,
        "relative flex flex-col gap-related p-4 pt-6",
        open && "border-violet",
      )}
    >
      <KindSticker kind={row.kind} />

      <div className="flex items-start gap-2">
        {/* A handle for the mouse only: a finger dragging here would scroll
            the page, and the arrows below do the same job for both. */}
        <span
          draggable
          onDragStart={onDragStart}
          aria-hidden="true"
          className="mt-1 hidden cursor-grab text-ink-muted pointer-fine:block"
        >
          <GripVertical className="size-5" />
        </span>
        <div inert className="min-w-0 flex-1">
          {view}
        </div>
      </div>

      {open ? (
        <>
          <hr className="border-t-2 border-dashed border-lilac" />
          <BlockSettings row={row} position={position} problems={problems} onChange={onChange} />

          {row.answered ? (
            <p className="text-sm text-ink-muted">{t("registrationOptions.inUse")}</p>
          ) : null}

          {/* Icon-only, so the aria-label carries the block and a screen
              reader hears which one moves. Remove sits at the far end, away
              from the arrows (ADR 0025). */}
          <div className="flex flex-wrap items-center gap-tight">
            <Button
              type="button"
              variant="raised-light"
              size="icon"
              aria-label={t("registrationOptions.moveUp", { option: name })}
              aria-disabled={first}
              onClick={() => !first && onMove(-1)}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="raised-light"
              size="icon"
              aria-label={t("registrationOptions.moveDown", { option: name })}
              aria-disabled={last}
              onClick={() => !last && onMove(1)}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button type="button" variant="raised-light" onClick={onClose}>
              {t("registrationOptions.done")}
            </Button>
            {/* No remove for a block somebody answered: the server refuses
                it, and a button that can only fail is worse than none. */}
            {row.answered ? null : (
              <Button
                type="button"
                variant="raised-light"
                className="ml-auto text-danger"
                onClick={onRemove}
              >
                <Trash2 aria-hidden="true" />
                {t("registrationOptions.remove", { option: name })}
              </Button>
            )}
          </div>
        </>
      ) : (
        // Over the whole card, so a tap anywhere on the block opens it.
        <button
          type="button"
          aria-label={t("registrationOptions.edit", { block: name })}
          onClick={onOpen}
          className="absolute inset-0 rounded-[18px] focus-visible:outline-3 focus-visible:outline-violet"
        />
      )}
    </div>
  );
}

/** The settings of one block, by kind: the old options editor's fields. */
function BlockSettings({
  row,
  position,
  problems,
  onChange,
}: {
  row: Draft;
  position: number;
  problems: BlockProblems;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const id = (field: string) => `${field}-${row.key}`;

  return (
    <div className="flex flex-col gap-related">
      <FormField
        id={id("label")}
        label={t("registrationOptions.label")}
        value={row.label}
        maxLength={255}
        onChange={(value) => onChange({ label: value })}
        problem={problems.label}
        // A paragraph may go without a title.
        required={row.kind !== "paragraph"}
      />
      {row.kind === "heading" ? null : (
        <FormField
          id={id("description")}
          label={
            row.kind === "paragraph"
              ? t("registrationOptions.body")
              : t("registrationOptions.description")
          }
          as={row.kind === "paragraph" ? "textarea" : "input"}
          maxLength={2000}
          value={row.description}
          onChange={(value) => onChange({ description: value })}
          problem={problems.description}
          required={row.kind === "paragraph"}
        />
      )}

      {row.kind === "quantity" ? (
        <>
          <div className="grid gap-related sm:grid-cols-2">
            <FormField
              id={id("price")}
              label={t("registrationOptions.price")}
              value={row.price}
              inputMode="decimal"
              hint={t("registrationOptions.priceHint")}
              onChange={(value) => onChange({ price: value })}
              problem={problems.price}
            />
            <FormField
              id={id("capacity")}
              label={t("registrationOptions.capacity")}
              value={row.capacity}
              inputMode="numeric"
              onChange={(value) => onChange({ capacity: value })}
              // The count the screen opened with, or the last save's: it does
              // not follow bookings made meanwhile.
              hint={
                row.remaining === null
                  ? t("registrationOptions.capacityHint")
                  : t("registrationOptions.capacityRemaining", { count: row.remaining })
              }
              problem={problems.capacity}
            />
          </div>
          <Toggle
            id={id("counts")}
            label={t("registrationOptions.countsGuests")}
            hint={t("registrationOptions.countsGuestsHint")}
            checked={row.countsGuests}
            // Fixed once answered, as the kind is: the server refuses it.
            disabled={row.answered}
            onChange={(checked) => onChange({ countsGuests: checked })}
          />
        </>
      ) : null}

      {row.kind === "choice" ? (
        <AnswersEditor
          row={row}
          position={position}
          problem={problems.answers}
          onChange={(answers) => onChange({ answers })}
        />
      ) : null}

      {isInput(row.kind) ? (
        <Toggle
          id={id("required")}
          label={t("registrationOptions.required")}
          checked={row.required}
          onChange={(checked) => onChange({ required: checked })}
        />
      ) : null}
    </div>
  );
}

/** A setting as a switch with its label beside it. */
export function Toggle({
  id,
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-touch items-center justify-between gap-2">
        <label htmlFor={id}>{label}</label>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onCheckedChange={onChange}
        />
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
 * An answer keeps its server id through a rename, which keeps the bookings
 * that picked it pointing at it. One somebody picked has no remove button,
 * since the server refuses removing it.
 */
function AnswersEditor({
  row,
  position,
  problem,
  onChange,
}: {
  row: Draft;
  position: number;
  problem: string | undefined;
  onChange: (answers: AnswerDraft[]) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-tight">
      <legend className="mb-tight text-sm font-semibold">{t("registrationOptions.answers")}</legend>
      {row.answers.map((answer, n) => (
        // A grid, so the remove button stays beside its field at 390px
        // instead of wrapping under it.
        <div key={answer.key} className="grid grid-cols-[1fr_auto] items-end gap-tight">
          <FormField
            id={`answer-${position}-${answer.key}`}
            label={t("registrationOptions.answerNumber", { n: n + 1 })}
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
          {answer.picked ? (
            // Keeps the column, so the fields line up with their neighbours.
            <span className="size-11" />
          ) : (
            <Button
              type="button"
              variant="raised-light"
              size="icon"
              aria-label={t("registrationOptions.removeAnswer", { n: n + 1 })}
              onClick={() => onChange(row.answers.filter((other) => other.key !== answer.key))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
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

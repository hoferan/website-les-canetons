import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { RegistrationOptionResource } from "../api/generated/model";
import { FormField, useBrowserProblem } from "../components/FormField";
import { t } from "../i18n";
import { formatCents } from "../money";

/**
 * One block of a booking form, as the guest sees it.
 *
 * Shared by the booking page and the form editor, so what the committee
 * builds is what a guest fills in. `value` is the quantity as typed for a
 * quantity, the text, the chosen answer's id, or yes / no; an empty string
 * is no answer.
 */
export function BlockView({
  option,
  value,
  onChange,
  problem,
}: {
  option: RegistrationOptionResource;
  value: string;
  onChange: (value: string) => void;
  /** The server's refusal of this block, or the required-answer sentence. */
  problem?: string;
}) {
  if (option.kind === "heading") {
    return <h3 className="mt-tight font-display text-lg">{option.label}</h3>;
  }
  if (option.kind === "paragraph") {
    return (
      <div className="flex flex-col gap-1">
        {option.label ? <p className="font-semibold">{option.label}</p> : null}
        {/* As typed, line breaks included: the committee writes it in a text
            area. */}
        <p className="whitespace-pre-line text-ink-muted">{option.description}</p>
      </div>
    );
  }
  if (option.kind === "quantity") {
    return <QuantityField option={option} problem={problem} value={value} onChange={onChange} />;
  }
  if (option.kind === "text") {
    return (
      <FormField
        id={`option-${option.id}`}
        label={option.label ?? ""}
        as="textarea"
        maxLength={1000}
        hint={option.description ?? undefined}
        required={option.required}
        problem={problem}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <RadioQuestion
      option={option}
      choices={
        option.kind === "yes_no"
          ? [
              { id: "yes", label: t("booking.yes") },
              { id: "no", label: t("booking.no") },
            ]
          : option.answers
      }
      problem={problem}
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * How many of one option, with what it costs beside it.
 *
 * A number input, not a checkbox: one booking carries quantities such as
 * "3 × viande, 1 × enfant".
 */
function QuantityField({
  option,
  problem,
  value,
  onChange,
}: {
  option: RegistrationOptionResource;
  /** The server's refusal of this line, such as `not_enough_places`. */
  problem: string | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `option-${option.id}`;
  const errorId = `${id}-error`;
  const placesId = `${id}-places`;
  // Outside FormField, so the browser's finding is picked up by hand. `max` is
  // 50, and without this a 99 typed here blocks the submit with no message.
  const browser = useBrowserProblem(option.label ?? "");
  const shown = browser.problem ?? problem;
  const soldOut = option.remaining === 0;
  // Null `remaining` is no capacity, so only the API's own cap of 50 applies.
  const max = Math.min(50, option.remaining ?? 50);

  return (
    // A grid, not `flex flex-wrap justify-between`: wrapping at 390px moved a
    // long option's box under its description, away from the other boxes. The
    // grid wraps the text inside its cell and keeps every box on the right.
    <div className="grid grid-cols-[1fr_auto] items-start gap-tight">
      <div className="flex flex-col">
        <label htmlFor={id}>
          {option.label}
          {option.required ? (
            <span aria-hidden="true" className="text-danger">
              {" "}
              *
            </span>
          ) : null}
          {/* Null, not zero: an option whose price lives in its description
              says nothing here instead of claiming to be free. */}
          {option.priceCents === null ? null : (
            <span className="text-ink-muted"> — {formatCents(option.priceCents)}</span>
          )}
        </label>
        {option.description ? (
          <span className="text-sm text-ink-muted">{option.description}</span>
        ) : null}
        {option.remaining === null ? null : (
          <span
            id={placesId}
            className={cn("text-sm", soldOut ? "font-semibold text-danger" : "text-ink-muted")}
            data-testid="places-left"
          >
            {soldOut ? t("booking.soldOut") : t("booking.placesLeft", { count: option.remaining })}
          </span>
        )}
      </div>

      {/* The vendored Input, which carries the 44px floor (`min-h-touch`); a
          bare input with `px-3 py-2` is 42px high. `w-20` wins over its
          `w-full` because `cn` tailwind-merges. */}
      <Input
        id={id}
        type="number"
        // A required quantity needs at least one, which the browser checks
        // before anything is sent, as it does for the contact fields.
        min={option.required ? 1 : 0}
        required={option.required && !soldOut}
        max={max}
        inputMode="numeric"
        className="w-20"
        // Disabled rather than hidden: a sold-out menu is still worth seeing,
        // and a guest who came for it learns why it cannot be chosen.
        disabled={soldOut}
        // Empty when sold out, matching `chosen`, which leaves it out.
        value={soldOut ? "" : value}
        placeholder="0"
        aria-invalid={shown ? true : undefined}
        aria-describedby={
          [option.remaining === null ? null : placesId, shown ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onInvalid={browser.onInvalid}
        onChange={(changed) => {
          browser.clear();
          onChange(changed.target.value);
        }}
      />
      {shown ? (
        <span id={errorId} className="col-span-2 text-sm text-danger" role="alert">
          {shown}
        </span>
      ) : null}
    </div>
  );
}

/**
 * One of several answers, as radio buttons under the question: a single
 * choice, or yes / no.
 *
 * Native radios in a fieldset, so the browser's own `required` check stops
 * an unanswered required question before anything is sent, as it does for
 * the contact fields.
 */
function RadioQuestion({
  option,
  choices,
  problem,
  value,
  onChange,
}: {
  option: RegistrationOptionResource;
  choices: { id: string; label: string }[];
  problem: string | undefined;
  value: string;
  onChange: (value: string) => void;
}) {
  const name = `option-${option.id}`;
  const hintId = `${name}-hint`;
  const errorId = `${name}-error`;
  // The browser's finding, raised by `formIsValid` on a required question
  // left unanswered. Without it focus lands on a radio and nothing says why.
  const [missing, setMissing] = useState(false);
  const shown = problem ?? (missing ? t("booking.answerRequired") : undefined);

  return (
    // min-w-0: a fieldset defaults to min-width: min-content, so one long
    // unbroken answer would widen the card past a phone's screen. Measured at
    // 258px of sideways scroll before this.
    <fieldset
      className="flex min-w-0 flex-col gap-1"
      aria-describedby={
        [option.description ? hintId : null, shown ? errorId : null].filter(Boolean).join(" ") ||
        undefined
      }
    >
      <legend>
        {option.label}
        {option.required ? (
          <span aria-hidden="true" className="text-danger">
            {" "}
            *
          </span>
        ) : null}
      </legend>
      {option.description ? (
        <span id={hintId} className="text-sm text-ink-muted">
          {option.description}
        </span>
      ) : null}
      {/* Wrapping rows, so two short answers sit side by side and a long list
          stacks at 390px. Each label is the touch target, 44px high. */}
      <div className="flex flex-wrap gap-x-related">
        {choices.map((choice) => (
          <label key={choice.id} className="flex min-h-touch cursor-pointer items-center gap-2">
            <input
              type="radio"
              name={name}
              value={choice.id}
              required={option.required}
              checked={value === choice.id}
              onInvalid={() => setMissing(true)}
              onChange={() => {
                setMissing(false);
                onChange(choice.id);
              }}
              className="size-5 shrink-0 accent-violet"
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">{choice.label}</span>
          </label>
        ))}
      </div>
      {shown ? (
        <span id={errorId} className="text-sm text-danger" role="alert">
          {shown}
        </span>
      ) : null}
    </fieldset>
  );
}

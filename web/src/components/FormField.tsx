import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent, type HTMLAttributes, type ReactNode, type Ref } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { FormField as FieldFrame, Input, RequiredMark } from "@ds";
import { cn } from "@/lib/utils";

import { t, type TranslatedError } from "../i18n";

/**
 * The form-wide error, in a live region that is always in the tree.
 *
 * Some browser and screen reader pairs miss a `role="alert"` element that is
 * inserted in the same commit as other changes, which is exactly when a form
 * error appears (the same commit releases the submit button). Rendering the
 * region unconditionally and changing only its contents announces everywhere.
 */
export function FormError({ error }: { error: TranslatedError | null }) {
  return (
    <div role="alert">
      {error ? <p className="mt-related text-danger">{error.message}</p> : null}
    </div>
  );
}

/**
 * Whether a form may be sent, checked by the app rather than by the browser.
 *
 * Every form in the app is `noValidate` (#102), because the browser's own
 * bubble speaks the browser's language, which `web/src/i18n/` cannot reach.
 * `noValidate` switches off the bubble but not the checks:
 * `checkValidity()` still reads `required`, `type="email"` and `min`/`max`, and
 * fires `invalid` at every control that fails, which is where each FormField
 * picks up its own message (see `useBrowserProblem`).
 *
 * Call it after `preventDefault()` and return when it answers false. Focus
 * goes to the first failing control, whose `aria-describedby` then reads its
 * label and the message.
 */
export function formIsValid(form: HTMLFormElement): boolean {
  if (form.checkValidity()) {
    return true;
  }
  const first = Array.from(form.elements).find(
    (element): element is HTMLInputElement =>
      "validity" in element && !(element as HTMLInputElement).validity.valid,
  );
  first?.focus();
  return false;
}

/**
 * What the browser found wrong with one control, in the catalogue's words.
 *
 * Composed exactly as `translateApiError` composes a server refusal, label
 * then reason, so "Nom est obligatoire" reads the same whichever side caught it.
 * The label is the control's own rather than a `fields.*` lookup, because the
 * control has one and a lookup can miss.
 *
 * The message clears on the next change: it describes the value that was
 * submitted, and the moment that value is edited it may no longer be true.
 */
export function useBrowserProblem(label: string) {
  const [problem, setProblem] = useState<string>();

  const onInvalid = (event: FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // The bubble, in case a form forgets `noValidate`. The message below still
    // appears, but the submit never fires, so formIsValid never focuses.
    event.preventDefault();
    const control = event.currentTarget;
    setProblem(`${label} ${t(reasonFor(control.validity, control.type))}`);
  };

  return { problem, onInvalid, clear: () => setProblem(undefined) };
}

function reasonFor(validity: ValidityState, type: string) {
  if (validity.valueMissing) {
    return "validation.required" as const;
  }
  if (
    validity.rangeUnderflow ||
    validity.rangeOverflow ||
    validity.stepMismatch ||
    (validity.badInput && type === "number")
  ) {
    return "validation.invalid_number" as const;
  }
  return "validation.invalid_format" as const;
}

// The star lives in the design system; re-exported so existing importers keep working.
export { RequiredMark };

/** Goes at the top of any form with a required field, so the star has a key. */
export function RequiredLegend() {
  return (
    <p aria-hidden="true" className="text-sm text-ink-muted">
      <RequiredMark /> {t("common.requiredLegend")}
    </p>
  );
}

/**
 * One labelled text control, and the three attributes that have to agree.
 *
 * `aria-invalid`, `aria-describedby` and the error span's `id` are easy to
 * copy wrong, and a describedby pointing at a missing id announces nothing
 * while no test or browser complains. Every text input goes through here so
 * that wiring is written once. It renders one field and owns no mutation,
 * submit handler or layout.
 *
 * Checkboxes are not handled: their value is a boolean and their label sits
 * after the control. The forms that need one write it out by hand.
 *
 * The input is shadcn's vendored one, which carries the 44px touch floor and
 * the aria-invalid styling. The textarea keeps a hand-written class string
 * because the vendored set has no Textarea, so the two are kept visually in
 * step by hand.
 *
 * `type` applies to the input only: passing one with `as="textarea"`
 * type-checks but is ignored.
 *
 * `type="password"` brings a reveal toggle (#101). It goes back to hidden when
 * the field is emptied: the password page clears every field after a submit,
 * and a box left revealed would show the next password to an onlooker.
 *
 * `hint` is the text that belongs to the field before anything goes wrong,
 * such as a rule. It is described ahead of `problem`, so a screen reader reads
 * the rule and then what broke it.
 *
 * `problem` is the server's. The browser's own finding (see `formIsValid`) is
 * shown only when the server has said nothing, because the server knows
 * things the browser cannot, "déjà utilisé" among them.
 *
 * `describedBy` names elements outside the field that describe it too, such as
 * a rule or an error about a group of fields, and `invalid` marks the field
 * as part of such an error when it has no problem of its own. The history
 * form's "at least one of four" is the case both exist for.
 *
 * `badge` sits inside the label after its text, so it is part of the
 * accessible name: the content editors mark a field's language that way, and
 * `lang` tells the browser which language to spell-check. `grow` makes a
 * textarea follow its content from three rows up, where `rows` alone would fix
 * it at six. `controlRef` reaches the control itself, for a form library that
 * focuses the first field it refused. `action` is a button laid over the
 * control's right edge, top right on a textarea, the way the password toggle
 * sits: the content editors clear the German text with one. It is for the
 * plain input and the textarea, not for a password.
 */
export function FormField({
  id,
  label,
  value,
  onChange,
  problem,
  hint,
  as = "input",
  type = "text",
  required = false,
  autoComplete,
  autoCapitalize,
  describedBy: outside,
  invalid = false,
  maxLength,
  inputMode,
  badge,
  lang,
  grow = false,
  controlRef,
  action,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  problem?: string | undefined;
  hint?: ReactNode;
  as?: "input" | "textarea";
  type?: string;
  required?: boolean;
  autoComplete?: string;
  autoCapitalize?: string;
  describedBy?: string;
  invalid?: boolean;
  maxLength?: number;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  badge?: ReactNode;
  lang?: string;
  grow?: boolean;
  controlRef?: Ref<HTMLInputElement & HTMLTextAreaElement>;
  action?: ReactNode;
}) {
  const browser = useBrowserProblem(label);
  const shown = problem ?? browser.problem;

  const [revealed, setRevealed] = useState(false);
  // Adjusting state while rendering, React's documented alternative to an
  // effect: an effect would paint one frame with the cleared field still
  // revealed.
  const [wasEmpty, setWasEmpty] = useState(value === "");
  if ((value === "") !== wasEmpty) {
    setWasEmpty(value === "");
    if (value === "") {
      setRevealed(false);
    }
  }

  // What the control carries besides the wiring that FieldFrame hands it.
  const own = {
    autoComplete,
    autoCapitalize,
    value,
    maxLength,
    inputMode,
    lang,
    ref: controlRef,
    onInvalid: browser.onInvalid,
  };

  // The wrapper exists only with an action, so the field's structure is
  // otherwise unchanged.
  const withAction = (control: ReactNode) =>
    action ? (
      <div className="relative">
        {control}
        <div
          className={cn(
            "absolute right-0",
            as === "textarea" ? "top-0" : "top-1/2 -translate-y-1/2",
          )}
        >
          {action}
        </div>
      </div>
    ) : (
      control
    );

  const change = (next: string) => {
    browser.clear();
    onChange(next);
  };

  return (
    <FieldFrame
      id={id}
      label={label}
      badge={badge}
      required={required}
      hint={hint}
      error={shown}
      describedBy={outside}
      invalid={invalid}
    >
      {(wiring) => {
        const shared = { ...own, ...wiring };
        return withAction(
          as === "textarea" ? (
            <textarea
              {...shared}
              // Growing: a row per line typed, where the browser cannot size the
              // box to its content itself; where it can, field-sizing also
              // follows the lines a long paragraph wraps onto.
              rows={grow ? Math.max(3, value.split("\n").length) : 6}
              onChange={(event) => change(event.target.value)}
              className={cn(
                "focus-ring w-full rounded-md border bg-panel px-3 py-2 text-ink outline-none",
                action && "pr-12",
                shown || invalid ? "border-danger" : "border-line",
                grow && "field-sizing-content min-h-[calc(3lh+1rem+2px)]",
              )}
            />
          ) : type === "password" ? (
            <div className="relative">
              <Input
                {...shared}
                type={revealed ? "text" : "password"}
                onChange={(event) => change(event.target.value)}
                // Room for the toggle, which sits over the input's right edge the
                // way SearchField's clear button does.
                className="pr-12"
              />
              <IconButton
                type="button"
                variant="quiet"
                icon={revealed ? EyeOff : Eye}
                className="absolute inset-y-0 right-0 h-auto"
                label={t("common.showPassword")}
                aria-pressed={revealed}
                aria-controls={id}
                onClick={() => setRevealed((shown) => !shown)}
              />
            </div>
          ) : (
            <Input
              {...shared}
              type={type}
              onChange={(event) => change(event.target.value)}
              className={action ? "pr-12" : undefined}
            />
          ),
        );
      }}
    </FieldFrame>
  );
}

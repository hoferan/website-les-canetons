import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { t, type TranslatedError } from "../i18n";

/**
 * The form-wide error, in a live region that is ALWAYS in the tree.
 *
 * A `role="alert"` element inserted into the DOM is announced by most
 * browser/AT pairs and missed by some — reliably missed when the insertion
 * shares a commit with other churn, which is exactly when a form error appears:
 * the same commit releases the submit button. Rendering the region
 * unconditionally and changing only its contents is the shape that announces
 * everywhere.
 *
 * It lives beside FormField because the two are the same decision — wiring that
 * is trivially correct, just as trivially copy-pasted wrong, and worth writing
 * once. There were four byte-identical copies of the old block before this.
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
 * Every form in the app is `noValidate` (#102). The browser's own bubble is
 * written in the browser's language, so an English browser said "Please fill
 * out this field." on a French page, and nothing in `web/src/i18n/` could
 * reach it. `noValidate` switches off the bubble but not the checks:
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
 * then reason, so "Nom est requis" reads the same whichever side caught it.
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

/**
 * The star beside a required label, and the line that says what it means.
 *
 * Both are `aria-hidden`. A screen reader already hears "required" from the
 * control's `required` attribute, and "astérisque" spoken after every label
 * would add nothing to it. The star sits BESIDE the label rather than inside
 * it, so the label's text stays "Nom" and every query by label still finds it.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-danger">
      *
    </span>
  );
}

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
 * `aria-invalid`, `aria-describedby` and the error span's `id` are trivially
 * correct and just as trivially copy-pasted wrong — a describedby pointing at
 * an id that does not exist announces nothing at all, and nothing in a test or
 * a browser complains. Every form in this app routes its text inputs through
 * here so that wiring is written once.
 *
 * It deliberately does NOT own the mutation, the submit handler or the page's
 * layout. It renders one field.
 *
 * Checkboxes are not handled: their value is a boolean, their label sits after
 * the control rather than before it, and there is exactly one in the whole app.
 * The event form writes that one out by hand.
 *
 * The INPUT is shadcn's vendored one, which carries the 44px touch floor and the
 * aria-invalid styling. The TEXTAREA keeps a hand-written class string, on
 * purpose: there is no Textarea in the vendored set, and one call site in the
 * whole app does not earn a component. The two therefore have to be kept
 * visually in step by hand, which is cheap at one.
 *
 * `type` applies to the input only — a textarea has none, and passing one
 * alongside `as="textarea"` type-checks but is silently ignored.
 *
 * `type="password"` brings a reveal toggle with it (#101), so no password
 * field in the app can be written without one. It goes back to hidden when the
 * field is emptied: the password page clears every field after a submit,
 * whatever the outcome, and a revealed box that stays revealed would show the
 * next password to whoever is looking over the member's shoulder.
 *
 * `hint` is the text that belongs to the field before anything goes wrong,
 * such as a rule. It is described ahead of `problem`, so a screen reader reads
 * the rule and then what broke it.
 *
 * `problem` is the server's. The browser's own finding (see `formIsValid`) is
 * shown only when the server has said nothing, because the server knows
 * things the browser cannot, "déjà utilisé" among them.
 *
 * `describedBy` names elements OUTSIDE the field that describe it too, such as
 * a rule or an error about a group of fields, and `invalid` marks the field
 * as part of such an error when it has no problem of its own. The history
 * form's "at least one of four" is the case both exist for.
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
  describedBy: outside,
  invalid = false,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  problem?: string;
  hint?: ReactNode;
  as?: "input" | "textarea";
  type?: string;
  required?: boolean;
  autoComplete?: string;
  describedBy?: string;
  invalid?: boolean;
  maxLength?: number;
}) {
  const browser = useBrowserProblem(label);
  const shown = problem ?? browser.problem;

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [outside ?? null, hint ? hintId : null, shown ? errorId : null]
    .filter(Boolean)
    .join(" ");

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

  const shared = {
    id,
    required,
    autoComplete,
    value,
    maxLength,
    onInvalid: browser.onInvalid,
    "aria-invalid": shown || invalid ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };

  const change = (next: string) => {
    browser.clear();
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <div>
        <label htmlFor={id}>{label}</label>
        {required ? (
          <>
            {" "}
            <RequiredMark />
          </>
        ) : null}
      </div>
      {as === "textarea" ? (
        <textarea
          {...shared}
          rows={6}
          onChange={(event) => change(event.target.value)}
          className={cn(
            "focus-ring w-full rounded-md border bg-panel px-3 py-2 text-ink outline-none",
            shown ? "border-danger" : "border-line",
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-1/2 right-0 -translate-y-1/2"
            aria-label={t("common.showPassword")}
            aria-pressed={revealed}
            aria-controls={id}
            onClick={() => setRevealed((shown) => !shown)}
          >
            {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
      ) : (
        <Input {...shared} type={type} onChange={(event) => change(event.target.value)} />
      )}
      {hint ? (
        <div id={hintId} className="text-sm text-ink-muted">
          {hint}
        </div>
      ) : null}
      {shown ? (
        <span id={errorId} className="block text-sm text-danger">
          {shown}
        </span>
      ) : null}
    </div>
  );
}

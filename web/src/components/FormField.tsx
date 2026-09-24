import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";

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
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, problem ? errorId : null].filter(Boolean).join(" ");

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
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": describedBy || undefined,
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {as === "textarea" ? (
        <textarea
          {...shared}
          rows={6}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "focus-ring w-full rounded-md border bg-panel px-3 py-2 text-ink outline-none",
            problem ? "border-danger" : "border-line",
          )}
        />
      ) : type === "password" ? (
        <div className="relative">
          <Input
            {...shared}
            type={revealed ? "text" : "password"}
            onChange={(event) => onChange(event.target.value)}
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
        <Input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint ? (
        <div id={hintId} className="text-sm text-ink-muted">
          {hint}
        </div>
      ) : null}
      {problem ? (
        <span id={errorId} className="block text-sm text-danger">
          {problem}
        </span>
      ) : null}
    </div>
  );
}

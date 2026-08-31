import type { TranslatedError } from "../i18n";

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
    <div role="alert">{error ? <p className="mt-4 text-danger">{error.message}</p> : null}</div>
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
 * `type` applies to the input only — a textarea has none, and passing one
 * alongside `as="textarea"` type-checks but is silently ignored.
 */
export function FormField({
  id,
  label,
  value,
  onChange,
  problem,
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
  as?: "input" | "textarea";
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const errorId = `${id}-error`;
  const shared = {
    id,
    required,
    autoComplete,
    value,
    "aria-invalid": problem ? true : undefined,
    "aria-describedby": problem ? errorId : undefined,
    className: `w-full rounded border bg-panel px-3 py-2 text-ink outline-none focus:border-violet focus:ring-2 focus:ring-violet/30 ${
      problem ? "border-danger" : "border-line"
    }`,
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      {as === "textarea" ? (
        <textarea {...shared} rows={6} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input {...shared} type={type} onChange={(event) => onChange(event.target.value)} />
      )}
      {problem ? (
        <span id={errorId} className="block text-sm text-danger">
          {problem}
        </span>
      ) : null}
    </div>
  );
}

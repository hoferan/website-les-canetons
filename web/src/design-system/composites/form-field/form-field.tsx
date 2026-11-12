import type { ReactNode } from "react";

/**
 * The attributes a control must carry for the field to work, handed to the
 * control by FormField. Spread them onto the `<input>`, `<textarea>` or any
 * other control: `<FormField …>{(control) => <Input {...control} />}</FormField>`.
 */
export type FieldControlProps = {
  id: string;
  required: boolean;
  "aria-invalid": true | undefined;
  "aria-describedby": string | undefined;
};

export type FormFieldProps = {
  /** The control's id; the label, hint and error ids are derived from it. */
  id: string;
  /** Visible label, already translated. */
  label: string;
  /** Sits inside the label after its text, so it is part of the accessible name. */
  badge?: ReactNode;
  /** Adds the star beside the label and `required` on the control. */
  required?: boolean;
  /** Text that belongs to the field before anything goes wrong, such as a rule. */
  hint?: ReactNode;
  /** What is wrong, already translated. Absent means the field is fine. */
  error?: string | undefined;
  /** Ids of elements outside the field that describe it too, such as a group rule. */
  describedBy?: string | undefined;
  /** Marks the field invalid when the error belongs to a group, not to this field. */
  invalid?: boolean;
  /** Renders the control. It must spread everything it is given onto one element. */
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * The star beside a required label.
 *
 * `aria-hidden`: a screen reader already hears "required" from the control's
 * `required` attribute. The star sits beside the label, not inside it, so the
 * label's text stays "Nom" and every query by label still finds it.
 */
export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-feedback-error">
      *
    </span>
  );
}

/**
 * A labelled form control with a hint and an error (layer 3, a composite).
 *
 * It exists for the wiring that is easy to copy wrong: `aria-invalid`,
 * `aria-describedby` and the ids of the hint and error elements have to agree,
 * and a describedby pointing at a missing id announces nothing while no test or
 * browser complains. FormField writes that once, and hands the result to the
 * control through `children`.
 *
 * It owns no value, no handlers and no translation: the label, hint and error
 * arrive as text. Anything that needs the app (turning a browser validity
 * state into a sentence in the visitor's language, say) happens before the
 * error reaches this component. The description order is outside ids, then the
 * hint, then the error, so a screen reader reads the rule and then what broke it.
 */
export function FormField({
  id,
  label,
  badge,
  required = false,
  hint,
  error,
  describedBy: outside,
  invalid = false,
  children,
}: FormFieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [outside ?? null, hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      <div>
        <label htmlFor={id}>
          {label}
          {badge ? <> {badge}</> : null}
        </label>
        {required ? (
          <>
            {" "}
            <RequiredMark />
          </>
        ) : null}
      </div>
      {children({
        id,
        required,
        "aria-invalid": error || invalid ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint ? (
        <div id={hintId} className="text-sm text-content-muted">
          {hint}
        </div>
      ) : null}
      {error ? (
        <span id={errorId} className="block text-sm text-feedback-error">
          {error}
        </span>
      ) : null}
    </div>
  );
}

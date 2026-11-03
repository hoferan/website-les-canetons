import { useId, type HTMLAttributes } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { FormField } from "../../components/FormField";
import { t } from "../../i18n";

/**
 * One untranslated text of a block: a number, an address, a URL, a name typed
 * once. `invalidMessage` is what to say when the block's type refuses the
 * value; without it the field says its format is wrong.
 */
export function PlainField({
  name,
  label,
  type = "text",
  inputMode,
  multiline = false,
  required = false,
  invalidMessage,
}: {
  name: string;
  label: string;
  type?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  multiline?: boolean;
  required?: boolean;
  invalidMessage?: string;
}) {
  const { control } = useFormContext();
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField
          id={id}
          label={label}
          value={(field.value as string | undefined) ?? ""}
          onChange={field.onChange}
          type={type}
          {...(inputMode ? { inputMode } : {})}
          as={multiline ? "textarea" : "input"}
          grow={multiline}
          maxLength={2000}
          required={required}
          problem={
            fieldState.error
              ? (invalidMessage ?? `${label} ${t("validation.invalid_format")}`)
              : undefined
          }
          controlRef={field.ref}
        />
      )}
    />
  );
}

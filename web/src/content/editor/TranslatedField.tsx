import { useEffect, useId, useRef, useState } from "react";
import {
  Controller,
  useFormContext,
  useWatch,
  type FieldValues,
  type Path,
  type PathValue,
} from "react-hook-form";

import { Button } from "@/components/ui/button";

import { FormField } from "../../components/FormField";
import { t } from "../../i18n";

type Props<T extends FieldValues> = {
  /** Where the `{ fr, de? }` pair sits in the block. */
  name: Path<T>;
  label: string;
  multiline?: boolean;
  required?: boolean;
};

/**
 * One text of a block, in French and, where it differs, in German.
 *
 * French is always there. German waits behind "+ Deutsch" until somebody has
 * a German wording to type, and is open from the start when the text has
 * one. A German field left blank, or taken away with "Retirer l'allemand",
 * stores no `de` at all, so the German page shows the French: a name or a
 * number reads the same in both.
 *
 * Both fields carry the same label, told apart by their language badge, which
 * is part of each one's accessible name.
 */
export function TranslatedField<T extends FieldValues = FieldValues>({
  name,
  label,
  multiline = false,
  required = false,
}: Props<T>) {
  const { control, setValue } = useFormContext<T>();
  const id = useId();
  const frName = `${name}.fr` as Path<T>;
  const deName = `${name}.de` as Path<T>;
  const german = useWatch({ control, name: deName }) as string | undefined;
  const [revealed, setRevealed] = useState(false);
  const open = revealed || german !== undefined;

  // Focus follows the button that was pressed, which leaves the tree: to the
  // German field it revealed, or back to "+ Deutsch".
  const germanRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"german" | "add" | null>(null);
  useEffect(() => {
    if (focusNext.current === "german") germanRef.current?.focus();
    if (focusNext.current === "add") addRef.current?.focus();
    focusNext.current = null;
  }, [open]);

  const as = multiline ? "textarea" : "input";

  return (
    <div className="flex flex-col gap-2">
      <Controller
        control={control}
        name={frName}
        render={({ field, fieldState }) => (
          <FormField
            id={`${id}-fr`}
            label={label}
            badge={<LanguageBadge>{t("blockEditor.french")}</LanguageBadge>}
            lang="fr"
            value={(field.value as string | undefined) ?? ""}
            onChange={field.onChange}
            as={as}
            grow={multiline}
            maxLength={2000}
            required={required}
            problem={fieldState.error ? `${label} ${t("validation.invalid_format")}` : undefined}
            controlRef={field.ref}
          />
        )}
      />

      {open ? (
        <>
          <Controller
            control={control}
            name={deName}
            render={({ field, fieldState }) => (
              <FormField
                id={`${id}-de`}
                label={label}
                badge={<LanguageBadge>{t("blockEditor.german")}</LanguageBadge>}
                lang="de"
                value={(field.value as string | undefined) ?? ""}
                onChange={(value) => {
                  // Kept open while emptied: the field stays where it is
                  // being typed in, it only stores nothing.
                  setRevealed(true);
                  field.onChange(value.trim() === "" ? undefined : value);
                }}
                as={as}
                grow={multiline}
                maxLength={2000}
                problem={
                  fieldState.error ? `${label} ${t("validation.invalid_format")}` : undefined
                }
                controlRef={(element) => {
                  germanRef.current = element;
                  field.ref(element);
                }}
              />
            )}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              focusNext.current = "add";
              setRevealed(false);
              setValue(deName, undefined as PathValue<T, Path<T>>, { shouldDirty: true });
            }}
          >
            {t("blockEditor.removeGerman")}
          </Button>
        </>
      ) : (
        <Button
          ref={addRef}
          type="button"
          variant="ghost"
          size="sm"
          className="self-start font-bold text-violet"
          onClick={() => {
            focusNext.current = "german";
            setRevealed(true);
          }}
        >
          {t("blockEditor.addGerman")}
        </Button>
      )}
    </div>
  );
}

/** "FR" or "DE" beside a label. Flex, not inline-block: see docs/traps.md. */
function LanguageBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-md border-2 border-ink bg-ground px-1.5 align-middle text-xs font-bold">
      {children}
    </span>
  );
}

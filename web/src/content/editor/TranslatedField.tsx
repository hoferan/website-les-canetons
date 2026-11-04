import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useController, useFormContext, type FieldValues, type Path } from "react-hook-form";

import { Button } from "@/components/ui/button";

import { FormField } from "../../components/FormField";
import { t } from "../../i18n";
import type { Translated } from "../translated";

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
 * number reads the same in both. A text the block's type may leave out is
 * dropped on save when it is blank in both languages (`useSaveBlock`).
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
  const { control } = useFormContext<T>();
  // One controller on the whole pair, so the pair's value and its errors
  // live in one place.
  const { field, fieldState } = useController({ control, name });
  const value = field.value as Translated | undefined;
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const open = revealed || value?.de !== undefined;

  const write = (fr: string, de: string | undefined) => {
    const german = de === undefined || de.trim() === "" ? undefined : de;
    // Never `undefined`, even for an optional text left blank in both
    // languages: react-hook-form reads it as "unset" and hands the field back
    // the value the form opened with, so the text reappears. The blank pair is
    // dropped on save instead (`useSaveBlock`).
    field.onChange({ fr, ...(german === undefined ? {} : { de: german }) });
  };

  // A refusal on the pair itself or on its French goes on the French field.
  const error = fieldState.error as { fr?: unknown; de?: unknown } | undefined;
  const problem = `${label} ${t("validation.invalid_format")}`;
  const frProblem = error && (error.fr || !error.de) ? problem : undefined;
  const deProblem = error?.de ? problem : undefined;

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
      <FormField
        id={`${id}-fr`}
        label={label}
        badge={<LanguageBadge>{t("blockEditor.french")}</LanguageBadge>}
        lang="fr"
        value={value?.fr ?? ""}
        onChange={(fr) => write(fr, value?.de)}
        as={as}
        grow={multiline}
        maxLength={2000}
        required={required}
        problem={frProblem}
        controlRef={field.ref}
      />

      {open ? (
        <>
          <FormField
            id={`${id}-de`}
            label={label}
            badge={<LanguageBadge>{t("blockEditor.german")}</LanguageBadge>}
            lang="de"
            value={value?.de ?? ""}
            onChange={(de) => {
              // Kept open while emptied: the field stays where it is being
              // typed in, it only stores nothing.
              setRevealed(true);
              write(value?.fr ?? "", de);
            }}
            as={as}
            grow={multiline}
            maxLength={2000}
            problem={deProblem}
            controlRef={(element) => {
              germanRef.current = element;
            }}
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("blockEditor.removeGerman")}
                onClick={() => {
                  focusNext.current = "add";
                  setRevealed(false);
                  write(value?.fr ?? "", undefined);
                }}
              >
                <X aria-hidden="true" />
              </Button>
            }
          />
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
    <span className="inline-flex rounded-md border-2 border-ink bg-ground px-1.5 align-[1.5px] text-xs font-bold">
      {children}
    </span>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useController, useFormContext, type FieldValues, type Path } from "react-hook-form";

import { Button } from "@ds";

import { FormField } from "../../components/FormField";
import { currentLocale, t } from "../../i18n";
import type { Translated } from "../translated";
import { StyleBar } from "./StyleBar";

/** What FormField hands a control ref: an input or a textarea. */
type Control = HTMLInputElement & HTMLTextAreaElement;

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
 * a German wording to type, and is open from the start when the text has one
 * or the page is German. A German field left blank stores no `de` at all, so
 * the German page shows the French: a name or a number reads the same in
 * both. Emptying the field is how German comes off; there is no button for
 * it. A text the block's type may leave out is dropped on save when it is
 * blank in both languages (`useSaveBlock`).
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
  // Opened or closed by hand; until then, open where the text has German or
  // the page is German (#368), where the editor is there to write it.
  const [shown, setShown] = useState<boolean | null>(null);
  const open = shown ?? (value?.de !== undefined || currentLocale() === "de-CH");

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

  // "+ Deutsch" leaves the tree when pressed, so focus moves on to the German
  // field it revealed.
  const germanRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const focusGerman = useRef(false);
  useEffect(() => {
    if (focusGerman.current) germanRef.current?.focus();
    focusGerman.current = false;
  }, [open]);

  const as = multiline ? "textarea" : "input";
  // The textareas themselves, for the bold and italic bar on each. The ref
  // callbacks stay the same from render to render: a new one is detached and
  // attached again on every commit, after the bar's layout effect has run,
  // which would then find no textarea to put the selection back on.
  const frenchArea = useRef<HTMLTextAreaElement | null>(null);
  const germanArea = useRef<HTMLTextAreaElement | null>(null);
  const formRef = field.ref;
  const frenchControl = useCallback(
    (element: Control | null) => {
      formRef(element);
      frenchArea.current = multiline ? element : null;
    },
    [formRef, multiline],
  );
  const germanControl = useCallback(
    (element: Control | null) => {
      germanRef.current = element;
      germanArea.current = multiline ? element : null;
    },
    [multiline],
  );

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
        controlRef={frenchControl}
        toolbar={
          multiline ? (
            <StyleBar
              target={frenchArea}
              value={value?.fr ?? ""}
              onChange={(fr) => write(fr, value?.de)}
            />
          ) : undefined
        }
      />

      {open ? (
        <FormField
          id={`${id}-de`}
          label={label}
          badge={<LanguageBadge>{t("blockEditor.german")}</LanguageBadge>}
          lang="de"
          value={value?.de ?? ""}
          onChange={(de) => {
            // Kept open while emptied: the field stays where it is being
            // typed in, it only stores nothing.
            setShown(true);
            write(value?.fr ?? "", de);
          }}
          as={as}
          grow={multiline}
          maxLength={2000}
          problem={deProblem}
          controlRef={germanControl}
          toolbar={
            multiline ? (
              <StyleBar
                target={germanArea}
                value={value?.de ?? ""}
                onChange={(de) => write(value?.fr ?? "", de)}
              />
            ) : undefined
          }
        />
      ) : (
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="self-start font-bold text-violet"
          onClick={() => {
            focusGerman.current = true;
            setShown(true);
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
    <span className="inline-flex rounded-sm border-2 border-ink bg-ground px-1.5 align-[1.5px] text-xs font-bold">
      {children}
    </span>
  );
}

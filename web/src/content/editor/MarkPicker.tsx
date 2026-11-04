import { useEffect, useRef } from "react";
import { useFormContext, useWatch, type FieldValues, type Path } from "react-hook-form";

import { t } from "../../i18n";
import type { Translated } from "../translated";
import { markOf, nextRun, runOf, tokenize, type MarkRun } from "./markTokens";

type Language = "fr" | "de";

/**
 * Picks a hero's highlighted words by tapping words of its title, under the
 * title fields: one row for French and, while the German title is there, one
 * for German. The block stores the picked text as the mark, as it always did,
 * so the page needs no change; a mark the edited title no longer holds is
 * dropped, as the page would stop highlighting it anyway.
 */
export function MarkPicker({ titleName, markName }: { titleName: string; markName: string }) {
  const { control, setValue, getValues } = useFormContext<FieldValues>();
  const title = useWatch({ control, name: titleName as Path<FieldValues> }) as
    Translated | undefined;
  const mark = useWatch({ control, name: markName as Path<FieldValues> }) as Translated | undefined;

  // Always from the form's current value, never from this render's: two
  // writes in one render (French and German) must not overwrite each other.
  const write = (language: Language, text: string | undefined) => {
    const current = getValues(markName as Path<FieldValues>) as Translated | undefined;
    setValue(markName as Path<FieldValues>, withMark(current, language, text), {
      shouldDirty: true,
    });
  };

  // Only a change of the title can orphan the mark; a stored mark that sits
  // off the word edges is left alone until then, and the page keeps showing it.
  const previous = useRef({ fr: title?.fr, de: title?.de });
  useEffect(() => {
    const before = previous.current;
    previous.current = { fr: title?.fr, de: title?.de };
    let next = getValues(markName as Path<FieldValues>) as Translated | undefined;
    let changed = false;
    for (const language of ["fr", "de"] as const) {
      const text = title?.[language] ?? "";
      const stored = next?.[language];
      if (before[language] === title?.[language] || !stored) continue;
      if (runOf(text, tokenize(text), stored) === null) {
        next = withMark(next, language, undefined);
        changed = true;
      }
    }
    if (changed) setValue(markName as Path<FieldValues>, next, { shouldDirty: true });
    // The title is the trigger; the rest is read fresh from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title?.fr, title?.de]);

  return (
    <div className="flex flex-col gap-3">
      <Row language="fr" title={title?.fr ?? ""} mark={mark?.fr} onPick={(m) => write("fr", m)} />
      {title?.de !== undefined ? (
        <Row language="de" title={title.de} mark={mark?.de} onPick={(m) => write("de", m)} />
      ) : null}
    </div>
  );
}

/** The mark pair with one language's text set, or taken away. */
function withMark(current: Translated | undefined, language: Language, text: string | undefined) {
  const next: Translated = { fr: current?.fr ?? "" };
  if (current?.de !== undefined) next.de = current.de;
  if (language === "fr") next.fr = text ?? "";
  else if (text === undefined) delete next.de;
  else next.de = text;
  return next;
}

function Row({
  language,
  title,
  mark,
  onPick,
}: {
  language: Language;
  title: string;
  mark: string | undefined;
  onPick: (mark: string | undefined) => void;
}) {
  const tokens = tokenize(title);
  const run: MarkRun | null = runOf(title, tokens, mark);
  const label = t("blockEditor.field.mark");
  const badge = t(language === "fr" ? "blockEditor.french" : "blockEditor.german");

  return (
    <div
      role="group"
      aria-label={`${label} ${badge}`}
      lang={language}
      className="flex flex-col gap-1"
    >
      <span className="text-sm font-bold" aria-hidden="true">
        {label}{" "}
        <span className="inline-flex rounded-md border-2 border-ink bg-ground px-1.5 align-[1.5px] text-xs font-bold">
          {badge}
        </span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {tokens.map((token, index) => {
          const inside = run !== null && index >= run[0] && index <= run[1];
          if (!token.tappable) {
            return (
              <span
                key={token.start}
                className={`px-0.5 ${inside ? "bg-highlight text-ink" : "text-ink-muted"}`}
              >
                {token.text}
              </span>
            );
          }
          return (
            <button
              key={token.start}
              type="button"
              aria-pressed={inside}
              onClick={() => onPick(markOf(title, tokens, nextRun(tokens, run, index)))}
              className={`min-h-touch min-w-touch rounded-md border-2 border-ink px-2 text-sm sm:min-h-8 sm:min-w-0 focus-visible:outline-3 focus-visible:outline-violet ${inside ? "bg-highlight text-ink" : "bg-panel hover:bg-ground"}`}
            >
              {token.text}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!mark}
          onClick={() => onPick(undefined)}
          className="min-h-touch px-2 text-sm font-bold text-violet underline disabled:text-ink-muted disabled:no-underline sm:min-h-8"
        >
          {t("blockEditor.markNone")}
        </button>
      </div>
    </div>
  );
}

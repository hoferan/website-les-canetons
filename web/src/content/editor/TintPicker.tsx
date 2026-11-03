import { Check } from "lucide-react";
import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { t } from "../../i18n";
import { TINTS, type Tint } from "../types";

/**
 * Each carnival colour's background, spelled out whole so Tailwind finds it.
 * The checked state repeats it, or the segment's own checked fill would win.
 */
export const TINT_BACKGROUNDS: Record<Tint, string> = {
  pink: "bg-pink data-[state=checked]:bg-pink",
  cyan: "bg-cyan data-[state=checked]:bg-cyan",
  lime: "bg-lime data-[state=checked]:bg-lime",
  yellow: "bg-yellow data-[state=checked]:bg-yellow",
  lilac: "bg-lilac data-[state=checked]:bg-lilac",
};

/**
 * The colour a card's picture sits on, one round swatch per tint. The picked
 * one carries a tick, so the choice does not rest on colour alone.
 */
export function TintPicker({ name }: { name: string }) {
  const { control } = useFormContext();
  const labelId = useId();

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId}>{t("blockEditor.tint")}</span>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <RadioGroup
            aria-labelledby={labelId}
            value={field.value as string}
            onValueChange={field.onChange}
            className="flex flex-wrap gap-2 border-0 bg-transparent p-0"
          >
            {TINTS.map((tint) => (
              <ToggleOption
                key={tint}
                value={tint}
                aria-label={t(`blockEditor.tints.${tint}`)}
                className={cn(
                  "group size-11 rounded-full border-2 border-ink px-0 text-ink data-[state=checked]:text-ink data-[state=checked]:shadow-raised-sm",
                  TINT_BACKGROUNDS[tint],
                )}
              >
                <Check
                  aria-hidden="true"
                  className="hidden size-5 group-data-[state=checked]:block"
                  strokeWidth={3}
                />
              </ToggleOption>
            ))}
          </RadioGroup>
        )}
      />
    </div>
  );
}

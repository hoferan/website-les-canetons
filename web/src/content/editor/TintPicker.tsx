import { Check } from "lucide-react";
import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";

import { t } from "../../i18n";
import { TINT_BACKGROUNDS } from "../cardLook";
import { TINTS } from "../types";

export { TINT_BACKGROUNDS };

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

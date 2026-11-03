import {
  Cake,
  Calendar,
  Clock,
  Info,
  Mail,
  MapPin,
  Music,
  Phone,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";

import { t } from "../../i18n";
import { ICONS, type Icon } from "../types";

/** Each card picture's glyph, for the picker and for the card that shows it. */
export const ICON_GLYPHS: Record<Icon, LucideIcon> = {
  music: Music,
  clock: Clock,
  cake: Cake,
  "map-pin": MapPin,
  phone: Phone,
  users: Users,
  calendar: Calendar,
  star: Star,
  info: Info,
  mail: Mail,
};

/**
 * A card's picture, one swatch per icon. A radio group, so the arrow keys
 * move the choice and a screen reader hears which one is picked.
 */
export function IconPicker({ name }: { name: string }) {
  const { control } = useFormContext();
  const labelId = useId();

  return (
    <div className="flex flex-col gap-1">
      <span id={labelId}>{t("blockEditor.icon")}</span>
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
            {ICONS.map((icon) => {
              const Glyph = ICON_GLYPHS[icon];
              return (
                <ToggleOption
                  key={icon}
                  value={icon}
                  aria-label={t(`blockEditor.icons.${icon}`)}
                  className="size-11 rounded-xl border-2 border-ink bg-white px-0 text-ink data-[state=checked]:bg-yellow data-[state=checked]:text-ink data-[state=checked]:shadow-raised-sm"
                >
                  <Glyph aria-hidden="true" className="size-5" />
                </ToggleOption>
              );
            })}
          </RadioGroup>
        )}
      />
    </div>
  );
}

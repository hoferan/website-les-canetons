import {
  Baby,
  Beer,
  Bus,
  Cake,
  Calendar,
  Camera,
  Car,
  Check,
  Clock,
  Coffee,
  Drum,
  Euro,
  Flag,
  Gift,
  Globe,
  Heart,
  House,
  Image,
  Info,
  Link,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  Music,
  Music2,
  PartyPopper,
  Phone,
  Piano,
  School,
  Shirt,
  Smile,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Ticket,
  Trophy,
  TrainFront,
  Users,
  Utensils,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { SearchField } from "@/components/SearchField";
import { RadioGroup, ToggleOption } from "@/components/ui/radio-group";

import { t } from "../../i18n";
import { catalogueValue } from "../../i18n/catalogueText";
import { matchesName } from "../../images/librarySearch";
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
  drum: Drum,
  notes: Music2,
  piano: Piano,
  mic: Mic,
  megaphone: Megaphone,
  "party-popper": PartyPopper,
  sparkles: Sparkles,
  ticket: Ticket,
  shirt: Shirt,
  bus: Bus,
  car: Car,
  train: TrainFront,
  utensils: Utensils,
  beer: Beer,
  coffee: Coffee,
  gift: Gift,
  heart: Heart,
  smile: Smile,
  baby: Baby,
  camera: Camera,
  image: Image,
  video: Video,
  globe: Globe,
  link: Link,
  euro: Euro,
  trophy: Trophy,
  flag: Flag,
  sun: Sun,
  snowflake: Snowflake,
  house: House,
  school: School,
  check: Check,
  message: MessageSquare,
};

/**
 * Whether the search finds the icon: by its name in either language, so a
 * German-speaking editor can find "Kalender" on the French page and the other
 * way round. Case and accents do not matter.
 */
function iconMatches(icon: Icon, query: string): boolean {
  return (["fr", "de-CH"] as const).some((locale) =>
    matchesName(catalogueValue(locale, `blockEditor.icons.${icon}`) ?? icon, query),
  );
}

/**
 * A card's picture, one swatch per icon. A radio group, so the arrow keys
 * move the choice and a screen reader hears which one is picked.
 *
 * About forty icons are a lot to scan on a phone, so a search box narrows
 * them. The picked icon always stays in the grid, filtered out or not, so an
 * editor never loses sight of what the card shows now.
 *
 * `labelledBy` names the grid by a label already on screen, such as the
 * switch that turns the icon on, which then stands in for the picker's own.
 */
export function IconPicker({ name, labelledBy }: { name: string; labelledBy?: string }) {
  const { control } = useFormContext();
  const ownLabelId = useId();
  const labelId = labelledBy ?? ownLabelId;
  const searchId = useId();
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {labelledBy ? null : <span id={labelId}>{t("blockEditor.icon")}</span>}
      {/* Enter in the box would submit the dialog's form: it only filters. */}
      <div
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
      >
        <SearchField
          id={searchId}
          label={t("blockEditor.iconSearch")}
          value={query}
          onChange={setQuery}
        />
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field }) => {
          const shown = ICONS.filter((icon) => icon === field.value || iconMatches(icon, query));
          return (
            <>
              <RadioGroup
                aria-labelledby={labelId}
                value={field.value as string}
                onValueChange={field.onChange}
                className="flex flex-wrap gap-2 border-0 bg-transparent p-0"
              >
                {shown.map((icon) => {
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
              {query.trim() !== "" && !ICONS.some((icon) => iconMatches(icon, query)) ? (
                <p className="text-sm text-ink-muted">{t("blockEditor.noIcon")}</p>
              ) : null}
            </>
          );
        }}
      />
    </div>
  );
}

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

const SWATCH =
  "size-11 rounded-xl border-2 border-ink bg-white px-0 text-ink data-[state=checked]:bg-yellow data-[state=checked]:text-ink data-[state=checked]:shadow-raised-sm";

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
 * The radio value of "no picture". The form holds it as "", which the
 * editor's schema saves as absent; a radio's own value must not be empty.
 */
const NONE = "none";

/**
 * A card's picture, one swatch per icon, after one for no picture at all. A radio group, so the arrow keys
 * move the choice and a screen reader hears which one is picked.
 *
 * About forty icons are a lot to scan on a phone, so a search box narrows
 * them. The picked icon always stays in the grid, filtered out or not, so an
 * editor never loses sight of what the card shows now. "No picture" is no
 * icon to search for, so it stays first whatever is typed.
 */
export function IconPicker({ name }: { name: string }) {
  const { control } = useFormContext();
  const labelId = useId();
  const searchId = useId();
  const [query, setQuery] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId}>{t("blockEditor.icon")}</span>
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
                // Absent on a card stored without one, "" once picked here.
                value={(field.value as string | undefined) || NONE}
                onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
                className="flex flex-wrap gap-2 border-0 bg-transparent p-0"
              >
                <ToggleOption
                  value={NONE}
                  aria-label={t("blockEditor.iconNone")}
                  className={SWATCH}
                >
                  {/* The dot the history form shows for an entry without an icon. */}
                  <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                </ToggleOption>
                {shown.map((icon) => {
                  const Glyph = ICON_GLYPHS[icon];
                  return (
                    <ToggleOption
                      key={icon}
                      value={icon}
                      aria-label={t(`blockEditor.icons.${icon}`)}
                      className={SWATCH}
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

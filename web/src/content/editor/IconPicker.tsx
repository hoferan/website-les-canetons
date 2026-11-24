import { useId, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { SearchField } from "@/components/SearchField";
import { RadioGroup, ToggleOption } from "@ds";

import { t } from "../../i18n";
import { catalogueValue } from "../../i18n/catalogueText";
import { matchesName } from "../../images/librarySearch";
import { ICON_GLYPHS } from "../cardLook";
import { ICONS, type Icon } from "../types";

export { ICON_GLYPHS };

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
                      className="size-11 rounded-md border-2 border-ink bg-white px-0 text-ink data-[state=checked]:bg-yellow data-[state=checked]:text-ink data-[state=checked]:shadow-raised-sm"
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

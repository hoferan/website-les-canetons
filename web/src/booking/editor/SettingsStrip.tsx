import { cn } from "@/lib/utils";

import { RAISED_CARD } from "../../carnival/raised";
import { FormField } from "../../components/FormField";
import { t } from "../../i18n";
import { Toggle } from "./EditableBlock";
import type { FormSettings } from "./settings";

/**
 * The form's own settings, at the top of the editor: whether it is open, who
 * fills it in, its window, and the people cap per booking. They left the event form for here
 * (#319), and the same save writes them with the blocks.
 */
export function SettingsStrip({
  settings,
  problemFor,
  onChange,
}: {
  settings: FormSettings;
  /** The server's refusal of one setting, by its field in the PUT. */
  problemFor: (field: string) => string | undefined;
  onChange: (patch: Partial<FormSettings>) => void;
}) {
  return (
    <section
      aria-labelledby="form-settings"
      className={cn(RAISED_CARD, "flex flex-col gap-related p-4")}
    >
      <h2 id="form-settings" className="font-display text-lg">
        {t("registrationOptions.settingsHeading")}
      </h2>

      <Toggle
        id="form-enabled"
        label={t("registrationOptions.enabled")}
        hint={
          settings.enabled
            ? t("registrationOptions.enabledOn")
            : t("registrationOptions.enabledOff")
        }
        checked={settings.enabled}
        onChange={(checked) => onChange({ enabled: checked })}
      />

      <Toggle
        id="form-members-only"
        label={t("registrationOptions.membersOnly")}
        hint={
          settings.membersOnly
            ? t("registrationOptions.membersOnlyOn")
            : t("registrationOptions.membersOnlyOff")
        }
        checked={settings.membersOnly}
        onChange={(checked) => onChange({ membersOnly: checked })}
      />

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="form-closes-date"
          label={t("registrationOptions.closesDate")}
          type="date"
          value={settings.closesDate}
          onChange={(value) => onChange({ closesDate: value })}
          problem={problemFor("form.registrationClosesAt")}
        />
        <FormField
          id="form-closes-time"
          label={t("registrationOptions.closesTime")}
          type="time"
          value={settings.closesTime}
          onChange={(value) => onChange({ closesTime: value })}
        />
      </div>
      {/* Said here, where the date was cleared: a form saved without one
          keeps its blocks, and nobody can reach it (ADR 0020). */}
      {settings.closesDate.trim() === "" ? (
        <p className="rounded-md bg-yellow p-3 text-sm" role="status">
          {t("registrationOptions.noClosingDate")}
        </p>
      ) : null}

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="form-opens-date"
          label={t("registrationOptions.opensDate")}
          type="date"
          value={settings.opensDate}
          hint={t("registrationOptions.opensHint")}
          onChange={(value) => onChange({ opensDate: value })}
          problem={problemFor("form.registrationOpensAt")}
        />
        <FormField
          id="form-opens-time"
          label={t("registrationOptions.opensTime")}
          type="time"
          value={settings.opensTime}
          onChange={(value) => onChange({ opensTime: value })}
        />
      </div>

      <FormField
        id="form-max-guests"
        label={t("registrationOptions.maxGuests")}
        inputMode="numeric"
        value={settings.maxGuests}
        hint={t("registrationOptions.maxGuestsHint")}
        onChange={(value) => onChange({ maxGuests: value })}
        problem={problemFor("form.registrationMaxGuests")}
      />
    </section>
  );
}

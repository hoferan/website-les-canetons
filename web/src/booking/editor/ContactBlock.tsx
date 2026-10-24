import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import { OUTLINED_CARD } from "../../carnival/raised";
import { FormField } from "../../components/FormField";
import { t } from "../../i18n";
import { FIELDS } from "../contactFields";
import { Toggle } from "./EditableBlock";

/**
 * The contact fields, locked at the top of every form.
 *
 * Name, email and phone are asked on every form; address and table are the
 * form's to ask for (ADR 0033), and their two switches live here, beside the
 * fields they add.
 */
export function ContactBlock({
  asksAddress,
  asksTable,
  guest,
  onChange,
}: {
  asksAddress: boolean;
  asksTable: boolean;
  guest: boolean;
  onChange: (patch: { asksAddress?: boolean; asksTable?: boolean }) => void;
}) {
  const fields = (
    <div className="flex flex-col gap-related">
      {FIELDS.filter(
        (field) =>
          (field.name !== "address" || asksAddress) && (field.name !== "tableName" || asksTable),
      ).map((field) => (
        <FormField
          key={field.name}
          id={`contact-${field.name}`}
          label={t(field.labelKey)}
          type={field.type}
          required={field.required}
          hint={field.hintKey ? t(field.hintKey) : undefined}
          value=""
          onChange={() => {}}
        />
      ))}
    </div>
  );

  if (guest) {
    return fields;
  }

  return (
    <div className={cn(OUTLINED_CARD, "relative flex flex-col gap-related p-4 pt-6")}>
      <span className="absolute -top-3.5 left-5 inline-flex -rotate-2 items-center gap-1 rounded-full border-2 border-ink bg-line px-2.5 py-0.5 text-sm font-semibold">
        <Lock aria-hidden="true" className="size-3.5" />
        {t("registrationOptions.contactLocked")}
      </span>
      <p className="text-ink-muted">{t("registrationOptions.contactHint")}</p>
      <div inert>{fields}</div>
      <hr className="border-t-2 border-dashed border-lilac" />
      <Toggle
        id="asks-address"
        label={t("registrationOptions.asksAddress")}
        checked={asksAddress}
        onChange={(checked) => onChange({ asksAddress: checked })}
      />
      <Toggle
        id="asks-table"
        label={t("registrationOptions.asksTable")}
        checked={asksTable}
        onChange={(checked) => onChange({ asksTable: checked })}
      />
    </div>
  );
}

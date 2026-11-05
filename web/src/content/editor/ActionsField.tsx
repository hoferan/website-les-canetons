import { useId } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { t } from "../../i18n";
import { PUBLIC_NAV, isPublicPage } from "../publicPages";
import { ListField } from "./ListField";
import { PlainField } from "./PlainField";
import { TranslatedField } from "./TranslatedField";

/** What a hero and the footer have room for: two buttons side by side on a phone. */
const MAX_ACTIONS = 2;

/**
 * A block's buttons, at most two, each a label in both languages and where it
 * leads. `name` is where the list sits in the block. The hero's editor and the
 * site's both use it.
 */
export function ActionsField({ name }: { name: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-bold">{t("blockEditor.actions.buttons")}</legend>
      <ListField
        name={name}
        max={MAX_ACTIONS}
        addLabel={t("blockEditor.actions.addButton")}
        newItem={() => ({ label: { fr: "" }, to: PUBLIC_NAV[0]!.to })}
        itemTitle={(index) => t("blockEditor.actions.button", { n: String(index + 1) })}
        renderItem={(index) => (
          <>
            <TranslatedField
              name={`${name}.${index}.label`}
              label={t("blockEditor.field.label")}
              required
            />
            <TargetField name={`${name}.${index}.to`} />
          </>
        )}
      />
    </fieldset>
  );
}

/** The select's value for "any other address": the target is then typed. */
const OTHER = "other";

/**
 * Where a link leads: one of the public pages, picked by name, or "another
 * link", whose https address is then typed. `name` holds the target as the
 * page renders it (`isActionTarget`): the page's path, or the address.
 */
export function TargetField({ name }: { name: string }) {
  const { control, setValue } = useFormContext();
  const selectId = useId();
  const to = (useWatch({ name }) as string | undefined) ?? "";
  const other = !isPublicPage(to);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId}>{t("blockEditor.actions.destination")}</label>
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <select
              id={selectId}
              className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
              value={other ? OTHER : (field.value as string)}
              onChange={(event) => {
                // "https://" is the start of the typed address, which keeps
                // the select on "other" until a page is chosen again.
                const next = event.target.value === OTHER ? "https://" : event.target.value;
                setValue(name, next, { shouldDirty: true });
              }}
            >
              {PUBLIC_NAV.map((page) => (
                <option key={page.to} value={page.to}>
                  {t(page.labelKey)}
                </option>
              ))}
              <option value={OTHER}>{t("blockEditor.actions.otherLink")}</option>
            </select>
          )}
        />
      </div>
      {other ? (
        <PlainField
          name={name}
          label={t("blockEditor.field.url")}
          type="url"
          inputMode="url"
          required
          invalidMessage={t("blockEditor.httpsExpected")}
        />
      ) : null}
    </>
  );
}

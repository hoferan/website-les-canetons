import { useId, useState, type ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { ButtonLink } from "@/components/ButtonLink";

import { PageHero } from "../../carnival/PageHero";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import {
  BlockEditor,
  EditChip,
  ListField,
  MarkPicker,
  PlainField,
  TranslatedField,
} from "../editor";
import { PUBLIC_NAV, isPublicPage } from "../publicPages";
import { BLOCKS, type BlockKey } from "../registry";
import { tr, trMark } from "../translated";
import { isActionTarget, type HeroAction, type heroBlock } from "../types";
import { useBlockEditing } from "./useBlockEditing";

/** The blocks that are a page's hero. */
export type HeroKey = {
  [K in BlockKey]: (typeof BLOCKS)[K]["schema"] extends typeof heroBlock ? K : never;
}[BlockKey];

/**
 * A public page's poster hero, its heading and the paragraph under it read
 * from the block, so the band changes both from one chip. The highlighted
 * words come from the block too, and show only while the heading still holds
 * them.
 *
 * `children` is page code under the paragraph, which the band does not edit.
 */
export function HeroBlock({
  blockKey,
  seed,
  width,
  children,
}: {
  blockKey: HeroKey;
  seed: number;
  width?: "shell" | "text" | "form";
  children?: ReactNode;
}) {
  const hero = useBlock(blockKey);
  const editing = useBlockEditing();
  const [open, setOpen] = useState(false);
  const intro = hero.intro ? tr(hero.intro) : "";
  const actions = hero.actions ?? [];

  return (
    <>
      <PageHero
        title={tr(hero.title)}
        mark={trMark(hero.title, hero.mark)}
        seed={seed}
        {...(width ? { width } : {})}
        edit={
          editing ? (
            <EditChip label={t(BLOCKS[blockKey].label)} onClick={() => setOpen(true)} />
          ) : null
        }
      >
        {intro !== "" || children || actions.length > 0 ? (
          <>
            {intro !== "" ? <p className="whitespace-pre-line">{intro}</p> : null}
            {children}
            <HeroActions actions={actions} />
          </>
        ) : null}
      </PageHero>
      {editing ? (
        <HeroEditor blockKey={blockKey} open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * A hero's buttons, the first the raised yellow one and the second the light
 * one. A public page keeps the visitor in their language through the router's
 * basename; an https address opens in a new tab and says so in its name, as
 * every outbound link does.
 *
 * A read lets any string through, so a target that is neither is dropped here:
 * an imported `javascript:` address must never become an href.
 */
export function HeroActions({ actions }: { actions: readonly HeroAction[] }) {
  const shown = actions.filter((action) => isActionTarget(action.to));
  if (shown.length === 0) return null;

  return (
    <div data-confetti-avoid className="mt-block flex w-fit flex-wrap gap-3">
      {shown.map((action, index) => {
        const external = !isPublicPage(action.to);
        const label = tr(action.label);
        return (
          <ButtonLink
            key={`${action.to}-${index}`}
            to={action.to}
            external={external}
            {...(external ? { ariaLabel: t("nav.newTab", { name: label }) } : {})}
            variant={index === 0 ? "accent" : "secondary"}
            className="h-12 px-5 text-base"
          >
            {label}
          </ButtonLink>
        );
      })}
    </div>
  );
}

/**
 * A hero's editor: heading, highlighted words, paragraph and up to two
 * buttons. For a page that lays its hero out itself, as the home page does.
 */
export function HeroEditor({
  blockKey,
  open,
  onClose,
}: {
  blockKey: HeroKey;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BlockEditor blockKey={blockKey} open={open} onClose={onClose}>
      {() => (
        <>
          <TranslatedField name="title" label={t("blockEditor.field.title")} required />
          <MarkPicker titleName="title" markName="mark" />
          <TranslatedField name="intro" label={t("blockEditor.field.intro")} multiline />
          <fieldset className="space-y-2">
            <legend className="font-bold">{t("blockEditor.hero.buttons")}</legend>
            <ListField
              name="actions"
              max={MAX_ACTIONS}
              addLabel={t("blockEditor.hero.addButton")}
              newItem={() => ({ label: { fr: "" }, to: PUBLIC_NAV[0]!.to })}
              itemTitle={(index) => t("blockEditor.hero.button", { n: String(index + 1) })}
              renderItem={(index) => <ActionFields path={`actions.${index}`} />}
            />
          </fieldset>
        </>
      )}
    </BlockEditor>
  );
}

/** What the hero has room for: two buttons side by side on a phone. */
const MAX_ACTIONS = 2;

/** The select's value for "any other address": the target is then typed. */
const OTHER = "other";

function ActionFields({ path }: { path: string }) {
  const { control, setValue } = useFormContext();
  const selectId = useId();
  const to = (useWatch({ name: `${path}.to` }) as string | undefined) ?? "";
  const other = !isPublicPage(to);

  return (
    <>
      <TranslatedField name={`${path}.label`} label={t("blockEditor.field.label")} required />
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId}>{t("blockEditor.hero.destination")}</label>
        <Controller
          control={control}
          name={`${path}.to`}
          render={({ field }) => (
            <select
              id={selectId}
              className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
              value={other ? OTHER : (field.value as string)}
              onChange={(event) => {
                // "https://" is the start of the typed address, which keeps
                // the select on "other" until a page is chosen again.
                const next = event.target.value === OTHER ? "https://" : event.target.value;
                setValue(`${path}.to`, next, { shouldDirty: true });
              }}
            >
              {PUBLIC_NAV.map((page) => (
                <option key={page.to} value={page.to}>
                  {t(page.labelKey)}
                </option>
              ))}
              <option value={OTHER}>{t("blockEditor.hero.otherLink")}</option>
            </select>
          )}
        />
      </div>
      {other ? (
        <PlainField
          name={`${path}.to`}
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

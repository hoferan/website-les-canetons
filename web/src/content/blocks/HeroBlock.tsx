import { useState, type ReactNode } from "react";

import { PageHero } from "../../carnival/PageHero";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import { ActionsField, BlockEditor, EditChip, MarkPicker, TranslatedField } from "../editor";
import { BLOCKS, type BlockKey } from "../registry";
import { tr, trMark } from "../translated";
import type { Action, heroBlock } from "../types";
import { ActionLink, shownActions } from "./ActionLink";
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
  const actions = shownActions(hero.actions);

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
      {editing || open ? (
        <HeroEditor blockKey={blockKey} open={open} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

/** A hero's buttons, in a row under its paragraph. */
export function HeroActions({ actions }: { actions: readonly Action[] | undefined }) {
  const shown = shownActions(actions);
  if (shown.length === 0) return null;

  return (
    <div data-confetti-avoid className="mt-block flex w-fit flex-wrap gap-3">
      {shown.map((action, index) => (
        <ActionLink
          key={`${action.to}-${index}`}
          action={action}
          index={index}
          className="h-12 px-5 text-base"
        />
      ))}
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
          <ActionsField name="actions" />
        </>
      )}
    </BlockEditor>
  );
}

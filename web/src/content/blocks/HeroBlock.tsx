import { useState, type ReactNode } from "react";

import { PageHero } from "../../carnival/PageHero";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import { BlockEditor, EditChip, TranslatedField } from "../editor";
import { BLOCKS, type BlockKey } from "../registry";
import { tr } from "../translated";
import type { heroBlock } from "../types";
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

  return (
    <>
      <PageHero
        title={tr(hero.title)}
        mark={hero.mark ? tr(hero.mark) : ""}
        seed={seed}
        {...(width ? { width } : {})}
        edit={
          editing ? (
            <EditChip label={t(BLOCKS[blockKey].label)} onClick={() => setOpen(true)} />
          ) : null
        }
      >
        {intro !== "" || children ? (
          <>
            {intro !== "" ? <p className="whitespace-pre-line">{intro}</p> : null}
            {children}
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
 * A hero's editor: heading, highlighted words and paragraph. For a page that
 * lays its hero out itself, as the home page does.
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
          <TranslatedField name="mark" label={t("blockEditor.field.mark")} />
          <TranslatedField name="intro" label={t("blockEditor.field.intro")} multiline />
        </>
      )}
    </BlockEditor>
  );
}

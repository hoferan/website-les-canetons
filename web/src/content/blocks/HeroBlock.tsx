import { useState, type ReactNode } from "react";

import { PageHero } from "../../carnival/PageHero";
import { onDemand } from "../../lib/lazy";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import { EditChip } from "../editor/EditChip";
import { BLOCKS } from "../registry";
import { lacksGerman, tr, trMark } from "../translated";
import type { Action } from "../types";
import { ActionLink, shownActions } from "./ActionLink";
import { useBlockEditing } from "./useBlockEditing";
import type { HeroKey } from "./hero";

export type { HeroKey };

/** Only for an editor in edit mode, so it is not in a visitor's bundle (#396). */
export const HeroEditor = onDemand(() => import("./HeroEditor"), "HeroEditor");

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
        editBlock={blockKey}
        title={tr(hero.title)}
        mark={trMark(hero.title, hero.mark)}
        seed={seed}
        {...(width ? { width } : {})}
        edit={
          editing ? (
            <EditChip
              label={t(BLOCKS[blockKey].label)}
              missingGerman={lacksGerman(hero)}
              onClick={() => setOpen(true)}
            />
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

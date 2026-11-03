import { useState, type ReactNode } from "react";

import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import { BlockEditor, EditChip, TranslatedField } from "../editor";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { tr, type Translated } from "../translated";
import type { fieldsBlock } from "../types";
import { useBlockEditing } from "./useBlockEditing";

/** The blocks that are a fixed set of named texts. */
export type FieldsKey = {
  [K in BlockKey]: (typeof BLOCKS)[K]["schema"] extends ReturnType<typeof fieldsBlock> ? K : never;
}[BlockKey];

type Name<K extends FieldsKey> = keyof BlockData<K> & string;

/**
 * A few named texts that the page lays out in its own markup, such as a
 * card's heading and the names under it. The page gets them in the current
 * language; in edit mode one chip over its markup opens a field per text.
 */
export function FieldsBlock<K extends FieldsKey>({
  blockKey,
  labels,
  children,
}: {
  blockKey: K;
  /** Each text's field label in the editor, in the order they are shown. */
  labels: Record<Name<K>, string>;
  children: (texts: Record<Name<K>, string>) => ReactNode;
}) {
  const block = useBlock(blockKey) as Record<Name<K>, Translated>;
  const editing = useBlockEditing();
  const [open, setOpen] = useState(false);
  const names = Object.keys(labels) as Name<K>[];
  const texts = Object.fromEntries(names.map((name) => [name, tr(block[name])])) as Record<
    Name<K>,
    string
  >;

  return (
    <div className="relative">
      {editing ? (
        <>
          <EditChip label={t(BLOCKS[blockKey].label)} onClick={() => setOpen(true)} />
          <BlockEditor blockKey={blockKey} open={open} onClose={() => setOpen(false)}>
            {() =>
              names.map((name) => (
                <TranslatedField key={name} name={name} label={labels[name]} required />
              ))
            }
          </BlockEditor>
        </>
      ) : null}
      {children(texts)}
    </div>
  );
}

import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";

import { rowsOf } from "../api/collection";
import { useBlockIndex } from "../api/generated/endpoints";
import type { ContentBlockResource } from "../api/generated/model";
import { BLOCKS, type BlockData, type BlockKey } from "./registry";

/**
 * The band's stored blocks, by key, as the server sent them. Unchecked: each
 * is parsed against its type where it is read. Empty outside the provider,
 * so a component rendered on its own shows the shipped content.
 */
const StoredBlocks = createContext<ReadonlyMap<string, unknown>>(new Map());

/**
 * How long the first paint waits for the blocks. Past it the page renders
 * the shipped content, and the band's arrives with a re-render: a slow server
 * costs a flash at worst, never a blank page.
 */
const BLOCKS_WAIT_MS = 1500;

/**
 * Whether the pages may render: the blocks have answered, or waited long
 * enough. True outside the provider, so a component rendered on its own
 * never waits.
 */
const BlocksReady = createContext(true);

/**
 * The band's content blocks, read once at boot.
 *
 * It renders its children at once, so SessionProvider below it asks for the
 * config and the session while the blocks are on their way. The pages wait
 * in {@link BlocksGate}.
 *
 * A failed or slow read is not a failed boot. Every block has its default to
 * fall back on, so the site renders with that and the failure goes to the
 * console.
 */
export function BlocksProvider({ children }: { children: ReactNode }) {
  const blocks = useBlockIndex(undefined, { query: { retry: false, staleTime: Infinity } });
  const [waitedEnough, setWaitedEnough] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedEnough(true), BLOCKS_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (blocks.isError) {
      console.error("Reading the site's content failed; showing the defaults.", blocks.error);
    }
  }, [blocks.isError, blocks.error]);

  const stored = useMemo(
    () => new Map(rowsOf<ContentBlockResource>(blocks.data).map((row) => [row.key, row.data])),
    [blocks.data],
  );

  const ready = !blocks.isPending || waitedEnough;

  return (
    <StoredBlocks value={stored}>
      <BlocksReady value={ready}>{children}</BlocksReady>
    </StoredBlocks>
  );
}

/**
 * Holds the pages until the blocks have answered, at most 1.5 s from boot: a
 * first paint in the shipped content would flash and then change. The wait
 * counts from BlocksProvider's mount, so a gate placed under the session gate
 * adds nothing to it.
 */
export function BlocksGate({ children }: { children: ReactNode }) {
  return use(BlocksReady) ? children : null;
}

/**
 * A block's content: the band's, or the default when nothing is stored.
 *
 * A stored block its type does not accept (saved by a newer build, or under a
 * type since changed) shows the default too, and says so on the console, so
 * the page keeps working with the shipped content.
 */
export function useBlock<K extends BlockKey>(key: K): BlockData<K> {
  const stored = use(StoredBlocks).get(key);

  return useMemo(() => {
    const definition = BLOCKS[key];
    if (stored === undefined) {
      return definition.defaults() as BlockData<K>;
    }
    const parsed = definition.schema.safeParse(stored);
    if (parsed.success) {
      const data = parsed.data as BlockData<K>;
      // A block saved before it carried buttons (a hero, the site block) has no
      // `actions`, which means "never edited", not "none": `[]` is the band's
      // way to say none.
      // Filling them in also seeds the editor, so saving such a block keeps them.
      const shipped = definition.defaults() as { actions?: unknown };
      if (shipped.actions !== undefined && (data as { actions?: unknown }).actions === undefined) {
        return { ...data, actions: shipped.actions } as BlockData<K>;
      }
      return data;
    }
    console.warn(
      `The stored block "${key}" does not fit its type; showing the default.`,
      parsed.error,
    );
    return definition.defaults() as BlockData<K>;
  }, [key, stored]);
}

/**
 * The block as the server sent it, unparsed, or undefined while the page shows
 * the shipped one: what an undo writes back.
 */
export function useStoredBlock(key: BlockKey): unknown {
  return use(StoredBlocks).get(key);
}

/** Whether the band has stored this block, so "Rétablir" has something to undo. */
export function useBlockStored(key: BlockKey): boolean {
  return use(StoredBlocks).has(key);
}

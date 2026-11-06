import { useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  getBlockIndexQueryKey,
  getImageIndexQueryKey,
  getPhotoSlotIndexQueryKey,
  photoSlotUpdate,
  useBlockUpdate,
} from "../../api/generated/endpoints";
import type { UpdateBlockRequestData } from "../../api/generated/model";
import { useApiFormError } from "../../api/useApiFormError";
import { t } from "../../i18n";
import { cardSlot, usePhotoSlots } from "../../images/photoSlots";
import { useSession } from "../../session/SessionProvider";
import { useBlock } from "../BlocksProvider";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";

/**
 * Saves one block from its editor.
 *
 * Data equal to the block's default is sent as null, which deletes the stored
 * block: the page then follows the shipped content again, so a later
 * correction in the code reaches it, and an editor who looked inside and saved
 * pins nothing.
 *
 * On success the page's blocks are read again before `onSaved` runs, so the
 * dialog closes onto the new content. A refusal leaves the dialog open with
 * the server's reason, translated.
 *
 * A card that showed a placed photo and is deleted, or has its photo switched
 * off, gets its slot emptied once the block is saved. Nothing would show that
 * slot any more, yet the server counts it as a use, so the library could not
 * delete the photo and would link to a page with no control left for it. An
 * editor without `images.manage` cannot empty a slot; the library's "Retirer
 * de cet emplacement" is there for whoever can.
 */
export function useSaveBlock<K extends BlockKey>(key: K, onSaved: () => void) {
  const queryClient = useQueryClient();
  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("blockEditor.saveFailed"));
  const current = useBlock(key);
  const { can } = useSession();
  const { photoOf } = usePhotoSlots();
  // Set by the save and read once it succeeds; a ref, since the dialog that
  // saved may close before the answer comes back.
  const orphans = useRef<string[]>([]);

  const update = useBlockUpdate({
    mutation: {
      onSuccess: async () => {
        const emptied = orphans.current;
        orphans.current = [];
        await emptySlots(emptied);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: getBlockIndexQueryKey() }),
          ...(emptied.length > 0
            ? [
                queryClient.invalidateQueries({ queryKey: getPhotoSlotIndexQueryKey() }),
                queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
              ]
            : []),
        ]);
        onSaved();
        toast(t("blockEditor.saved"));
      },
      onError: setFromThrown,
    },
  });

  const save = (typed: BlockData<K>) => {
    if (update.isPending) return;
    clear();
    const defaults = BLOCKS[key].defaults();
    const data = asSaved(key, typed);
    const kept = new Set(cardPhotoSlots(key, data));
    orphans.current = can("images.manage")
      ? cardPhotoSlots(key, current).filter((slot) => !kept.has(slot) && photoOf(slot) !== null)
      : [];
    const original = sameData(data, defaults);
    update.mutate({
      key,
      data: { data: original ? null : (data as UpdateBlockRequestData) },
    });
  };

  // The dialog has no input called `data`, so the server's reason for it (a
  // block too large, a list too long) becomes the error line itself.
  const dataProblem = messageFor("data");
  const shown = error && dataProblem ? { ...error, message: dataProblem } : error;

  return { save, pending: update.isPending, error: shown };
}

/**
 * A block's form values as a save sends them, without what the editor's
 * fields add on their own (a blank text, a hero's empty list of buttons).
 */
export function asSaved<K extends BlockKey>(key: K, typed: BlockData<K>): BlockData<K> {
  return withoutBlankTexts(BLOCKS[key].schema, withoutIdleActions(typed, BLOCKS[key].defaults()));
}

/** The photo slots of a block's cards that show one; none for a block without cards. */
function cardPhotoSlots(key: BlockKey, data: unknown): string[] {
  const cards = (data as { cards?: Array<{ id: string; photo?: boolean }> }).cards ?? [];
  return cards.filter((card) => card.photo === true).map((card) => cardSlot(key, card.id));
}

/**
 * Empties each slot. A slot that fails stays placed and listed in the library,
 * where it can be taken off by hand, so the block's save still counts.
 */
async function emptySlots(slots: string[]) {
  await Promise.all(
    slots.map((slot) => photoSlotUpdate(slot, { imageId: null }).catch(() => undefined)),
  );
}

/**
 * Whether two blocks hold the same content, as JSON would carry them: key
 * order does not matter, and a key whose value is undefined counts as absent,
 * since it never reaches the server.
 */
export function sameData(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    inner !== null && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)))
      : inner,
  );
}

/**
 * The block without its texts that are blank in both languages, where the
 * block's type lets them go. An editor holds such a text as `{ fr: "" }`,
 * because an undefined value would bring back the one the form opened with;
 * stored, it would only be a pair that renders as nothing. If dropping them
 * leaves a block the type refuses (a required text, left blank), the block
 * goes as typed and the refusal stays where it was.
 */
function withoutBlankTexts<T>(schema: z.ZodType, data: T): T {
  const pruned = prune(data) as T;
  return schema.safeParse(pruned).success ? pruned : data;
}

function prune(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(prune);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, inner]) => !isBlankText(inner))
      .map(([key, inner]) => [key, prune(inner)]),
  );
}

function isBlankText(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const keys = Object.keys(value);
  return keys.length === 1 && (value as { fr?: unknown }).fr === "";
}

/**
 * A hero's empty list of buttons, when the shipped hero has none either. The
 * list field opens an empty list on every hero, so saving without touching it
 * would otherwise differ from the default and pin the hero. Where the shipped
 * hero has buttons, an empty list is the band's answer and is kept.
 */
function withoutIdleActions<T>(data: T, defaults: unknown): T {
  const typed = data as { actions?: unknown[] };
  if (!Array.isArray(typed.actions) || typed.actions.length > 0) return data;
  if ((defaults as { actions?: unknown }).actions !== undefined) return data;
  return Object.fromEntries(Object.entries(typed).filter(([key]) => key !== "actions")) as T;
}

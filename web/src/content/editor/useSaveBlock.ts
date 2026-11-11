import {
  MutationObserver,
  useIsMutating,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import { Undo2 } from "lucide-react";
import type { z } from "zod";

import { notify } from "@/components/ui/toast";

import { rowsOf } from "../../api/collection";
import {
  blockUpdate,
  getBlockIndexQueryKey,
  getImageIndexQueryKey,
  getPhotoSlotIndexQueryKey,
  imageIndex,
  photoSlotUpdate,
  useBlockUpdate,
} from "../../api/generated/endpoints";
import type {
  ImageResource,
  PlacePhotoRequest,
  UpdateBlockRequestData,
} from "../../api/generated/model";
import { ApiError } from "../../api/http";
import { useApiFormError } from "../../api/useApiFormError";
import { t, translateApiError } from "../../i18n";
import { cardSlot, usePhotoSlots } from "../../images/photoSlots";
import { useSession } from "../../session/SessionProvider";
import { useSavedBlock, useStoredBlock } from "../BlocksProvider";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";

/**
 * Every block save shows its toast under this one id, so a new save replaces
 * the toast of the one before. Only the latest save can be undone: an older
 * toast's undo would write back a block that a later save has since changed.
 */
const SAVED_TOAST = "block-saved";

/** A photo a save took out of its slot, as the slot held it. */
type Placement = { slot: string } & Required<PlacePhotoRequest>;

/** What the save on its way will need once it succeeds. */
type Pending = { before: unknown; orphans: string[] };

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
 * The toast that says so carries an undo for ten seconds (#354), which writes
 * back the block as it was before: its stored data, or null when the page
 * showed the shipped content. The card grid's arrows save through here with
 * no dialog, and get the same undo.
 *
 * A card that showed a placed photo and is deleted, or has its photo switched
 * off, gets its slot emptied once the block is saved. Nothing would show that
 * slot any more, yet the server counts it as a use, so the library could not
 * delete the photo and would link to a page with no control left for it. The
 * undo places the same photo back. An editor without `images.manage` cannot
 * empty a slot; the library's "Retirer de cet emplacement" is there for
 * whoever can.
 */
export function useSaveBlock<K extends BlockKey>(key: K, onSaved: () => void) {
  const queryClient = useQueryClient();
  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("blockEditor.saveFailed"));
  // As saved, not as previewed: the photos a save takes out are the saved ones.
  const current = useSavedBlock(key);
  const stored = useStoredBlock(key);
  const { can } = useSession();
  const { photoOf } = usePhotoSlots();
  const undoing = useIsMutating({ mutationKey: undoKey(key) }) > 0;
  // Set by the save and read once it succeeds; a ref, since the dialog that
  // saved may close before the answer comes back.
  const pending = useRef<Pending>({ before: null, orphans: [] });

  const update = useBlockUpdate({
    mutation: {
      onSuccess: async () => {
        const { before, orphans } = pending.current;
        pending.current = { before: null, orphans: [] };
        // Read before the slots are emptied: once they are, nothing says
        // which photo each one held.
        const placed = await placementsOf(orphans);
        await emptySlots(orphans);
        await refresh(queryClient, orphans.length > 0);
        onSaved();
        notify.success(t("blockEditor.saved"), {
          id: SAVED_TOAST,
          action: {
            icon: Undo2,
            // attendance.undo, never common.cancel: both are "Annuler" in
            // French, but German says "Rückgängig" for this one.
            label: t("attendance.undo"),
            onClick: () => void undo(queryClient, key, before, placed),
          },
        });
      },
      onError: setFromThrown,
    },
  });

  const busy = update.isPending || undoing;

  const save = (typed: BlockData<K>) => {
    if (busy) return;
    clear();
    const defaults = BLOCKS[key].defaults();
    const data = asSaved(key, typed);
    const kept = new Set(cardPhotoSlots(key, data));
    pending.current = {
      before: stored ?? null,
      orphans: can("images.manage")
        ? cardPhotoSlots(key, current).filter((slot) => !kept.has(slot) && photoOf(slot) !== null)
        : [],
    };
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

  // An undo on its way counts as a save: the card grid's arrows wait for it,
  // or a move would start from the list the undo is replacing.
  return { save, pending: busy, error: shown };
}

const undoKey = (key: BlockKey) => ["blocks", key, "undo"] as const;

/**
 * Writes the block back as it was before the save, then places the photos the
 * save took out. It runs outside any component, since the dialog that saved
 * has closed by the time the toast is clicked; the mutation key lets the
 * block's arrows see it.
 *
 * A refused block write changes nothing, so the page stays as the save left
 * it. A photo that cannot be placed again leaves its slot empty, and a toast
 * says so.
 */
async function undo(queryClient: QueryClient, key: BlockKey, before: unknown, placed: Placement[]) {
  const observer = new MutationObserver(queryClient, {
    mutationKey: undoKey(key),
    mutationFn: async () => {
      await blockUpdate(key, { data: before as UpdateBlockRequestData | null });
      const results = await Promise.allSettled(
        placed.map(({ slot, ...placement }) => photoSlotUpdate(slot, placement)),
      );
      await refresh(queryClient, placed.length > 0);
      return results.every((result) => result.status === "fulfilled");
    },
  });
  try {
    const allPlaced = await observer.mutate();
    if (!allPlaced) notify.warning(t("blockEditor.undoPhotoFailed"));
  } catch (thrown) {
    notify.error(
      thrown instanceof ApiError ? translateApiError(thrown).message : t("attendance.undoFailed"),
    );
  }
}

/** Reads the blocks again, and the photos with them when a slot changed. */
async function refresh(queryClient: QueryClient, photos: boolean) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getBlockIndexQueryKey() }),
    ...(photos
      ? [
          queryClient.invalidateQueries({ queryKey: getPhotoSlotIndexQueryKey() }),
          queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
        ]
      : []),
  ]);
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
 * The photo each slot holds, with the name and page the library shows for it.
 * The public slot list does not say which image a slot shows, so this asks
 * the library, which the editor emptying slots may read. A slot it cannot
 * account for is left out, and the undo brings the card back without it.
 */
async function placementsOf(slots: string[]): Promise<Placement[]> {
  if (slots.length === 0) return [];
  try {
    const images = rowsOf<ImageResource>(await imageIndex());
    return slots.flatMap((slot) =>
      images.flatMap((image) =>
        image.usages
          .filter((usage) => usage.slot === slot)
          .map((usage) => ({ slot, imageId: image.id, label: usage.label, path: usage.path })),
      ),
    );
  } catch {
    return [];
  }
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

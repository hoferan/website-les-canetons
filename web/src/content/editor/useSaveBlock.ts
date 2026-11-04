import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { z } from "zod";

import { getBlockIndexQueryKey, useBlockUpdate } from "../../api/generated/endpoints";
import type { UpdateBlockRequestData } from "../../api/generated/model";
import { useApiFormError } from "../../api/useApiFormError";
import { t } from "../../i18n";
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
 */
export function useSaveBlock<K extends BlockKey>(key: K, onSaved: () => void) {
  const queryClient = useQueryClient();
  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("blockEditor.saveFailed"));

  const update = useBlockUpdate({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getBlockIndexQueryKey() });
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
    const data = withoutBlankTexts(BLOCKS[key].schema, withoutIdleActions(typed, defaults));
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

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
  const { error, setFromThrown, clear } = useApiFormError(t("blockEditor.saveFailed"));

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

  const save = (data: BlockData<K>) => {
    if (update.isPending) return;
    clear();
    const original = sameData(data, BLOCKS[key].defaults());
    update.mutate({
      key,
      data: { data: original ? null : (data as UpdateBlockRequestData) },
    });
  };

  return { save, pending: update.isPending, error };
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

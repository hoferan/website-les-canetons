import type { StateMessageProps } from "@ds";

import { t } from "../i18n";

/** The part of a React Query result this reads, whatever its data and error. */
type ListQuery = {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  errorUpdateCount: number;
  refetch: () => Promise<unknown>;
};

type EmptyCopy = Omit<Extract<StateMessageProps, { state: "empty" }>, "state">;

/**
 * Maps a list's query onto StateMessage (#387, #388), or null once there are
 * rows to show. Every list screen goes through here, so they all fail, load
 * and come up empty the same way.
 *
 * `empty` is the caller's: null while the list has rows, and otherwise what to
 * say about it. It is only read once the query has an answer.
 *
 * An error wins over rows. A refetch that fails keeps the rows it had, and the
 * caller keeps rendering them below the error.
 *
 * React Query sends a query that has no data back to pending for a retry.
 * That retry stays an error with a busy Réessayer, or the skeleton would
 * unmount the button the reader just pressed.
 */
export function listState(
  query: ListQuery,
  copy: {
    loadFailed: string;
    empty: EmptyCopy | null;
    /** The skeleton: how many rows, each the height of the item in rem. */
    rows?: number;
    rowHeight?: number;
  },
): StateMessageProps | null {
  const retrying = query.isPending && query.errorUpdateCount > 0;
  if (query.isError || retrying) {
    return {
      state: "error",
      title: copy.loadFailed,
      description: t("common.loadFailedHint"),
      retry: {
        label: t("common.retry"),
        onRetry: () => void query.refetch(),
        busy: query.isFetching,
      },
    };
  }
  if (query.isPending) {
    return {
      state: "loading",
      label: t("common.loading"),
      rows: copy.rows,
      rowHeight: copy.rowHeight,
    };
  }
  return copy.empty === null ? null : { state: "empty", ...copy.empty };
}

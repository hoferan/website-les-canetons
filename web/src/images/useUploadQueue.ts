import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  getImageIndexQueryKey,
  getImageReplaceUrl,
  getImageStoreUrl,
  getImageSummaryQueryKey,
  type imageReplaceResponse,
  type imageReplaceResponseSuccess,
  type imageStoreResponse,
} from "../api/generated/endpoints";
import { customFetch } from "../api/http";
import { t } from "../i18n";
import { shrink } from "./shrink";
import { type Card, type ShrinkFn, type UploadFn, UploadQueue } from "./uploadQueue";
import { useLeaveGuard } from "./useLeaveGuard";

export type { Card, CardState, FailureReason } from "./uploadQueue";

/**
 * Sends every size of one photo and its name in one request: 200 is a
 * duplicate, 201 a new photo.
 *
 * Built here rather than through the generated imageStore(), which names each
 * part `files`. PHP keeps only the last of several parts sharing a bare name;
 * `files[]` is how it collects them into a list.
 */
export const uploadViaApi: UploadFn = async (sizes, name) => {
  const body = sizesBody(sizes);
  body.append("name", name);

  const response = await customFetch<imageStoreResponse>(getImageStoreUrl(), {
    method: "POST",
    body,
  });
  // The mutator throws on any other status, so this only narrows the type.
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Unexpected image store status ${response.status}`);
  }
  return { status: response.status, id: response.data.id };
};

/** One `files[]` part per size, the way PHP collects them into a list. */
function sizesBody(sizes: Blob[]): FormData {
  const body = new FormData();
  for (const size of sizes) body.append("files[]", size, "photo.jpg");
  return body;
}

/** Replaces a photo's sizes; built by hand for the reason uploadViaApi is. */
export type ReplaceFn = (
  id: number,
  sizes: Blob[],
  etag: string,
) => Promise<imageReplaceResponseSuccess>;

export const replaceViaApi: ReplaceFn = async (id, sizes, etag) => {
  const response = await customFetch<imageReplaceResponse>(getImageReplaceUrl(id), {
    method: "POST",
    body: sizesBody(sizes),
    headers: { "If-Match": etag },
  });
  // The mutator throws on any other status, so this only narrows the type.
  if (response.status !== 200) {
    throw new Error(`Unexpected image replace status ${response.status}`);
  }
  return response;
};

/**
 * Both default to the real thing. Tests inject them, because jsdom has no
 * canvas to shrink with and cannot send a multipart body.
 */
type Options = { upload?: UploadFn | undefined; shrinker?: ShrinkFn | undefined };

/**
 * The one way a photo gets into the library from the browser: /media, the
 * picker and a photo dropped on a page slot all add files here, so each is
 * shrunk and sent the same way.
 */
export function useUploadQueue({ upload = uploadViaApi, shrinker = shrink }: Options = {}): {
  cards: Card[];
  add(files: FileList | File[]): string[];
  settled(id: string): Promise<Card>;
  retry(id: string): void;
  retryAllFailed(): void;
  busy: boolean;
} {
  const client = useQueryClient();

  // The queue outlives renders, but `upload` is usually a fresh closure each
  // time. Reading it through a ref keeps the latest one without rebuilding the
  // queue and losing its cards.
  const latest = useRef({ upload, shrinker, client });
  latest.current = { upload, shrinker, client };

  const [queue] = useState(
    () =>
      new UploadQueue({
        upload: (sizes, name) => latest.current.upload(sizes, name),
        shrinker: (file) => latest.current.shrinker(file),
        onSettled: () => {
          void latest.current.client.invalidateQueries({ queryKey: getImageIndexQueryKey() });
          void latest.current.client.invalidateQueries({ queryKey: getImageSummaryQueryKey() });
        },
      }),
  );

  // Unmounting stops new work from starting: photos still waiting are not
  // sent, and the ones in flight finish. The leave guard below asks before a
  // link click gets this far. Back and a call to navigate() come straight here.
  useEffect(() => {
    queue.activate();
    return () => queue.dispose();
  }, [queue]);

  const cards = useSyncExternalStore(queue.subscribe, queue.getSnapshot);
  const busy = queue.isBusy(cards);

  // Leaving mid-queue abandons photos that have not uploaded yet.
  useLeaveGuard(busy, t("photos.leaveWarning"));

  const add = useCallback((files: FileList | File[]) => queue.add(files), [queue]);
  const settled = useCallback((id: string) => queue.settled(id), [queue]);
  const retry = useCallback((id: string) => queue.retry(id), [queue]);
  const retryAllFailed = useCallback(() => queue.retryAllFailed(), [queue]);

  return { cards, add, settled, retry, retryAllFailed, busy };
}

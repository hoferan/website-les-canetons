import { Plus } from "lucide-react";
import { useRef, useState } from "react";

import { rowsOf } from "../api/collection";
import { useImageIndex, useImageSummary } from "../api/generated/endpoints";
import type { ImageResource } from "../api/generated/model";
import { Notice } from "../components/Notice";
import { PageSection } from "../components/PageSection";
import { Button } from "@/components/ui/button";
import { currentLocale, t } from "../i18n";
import { intlTag } from "../i18n/locale";
import { LibraryGrid } from "../images/LibraryGrid";
import { UploadCards, unlisted } from "../images/UploadCards";
import type { Card, ShrinkFn, UploadFn } from "../images/uploadQueue";
import { useUploadQueue } from "../images/useUploadQueue";

const BYTES_PER_MEGABYTE = 1024 * 1024;

function megabytes(bytes: number): string {
  return new Intl.NumberFormat(intlTag(currentLocale()), {
    style: "unit",
    unit: "megabyte",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(bytes / BYTES_PER_MEGABYTE);
}

/**
 * Cards that will take a place in the library but are not in its count yet:
 * the ones still on their way, and the ones that landed since the summary was
 * last read. The summary is refreshed only when the queue goes idle, so
 * without the second half a second selection made mid-queue would be told
 * there is more room than there is.
 */
function claimed(cards: Card[], listed: Set<number>): number {
  return cards.filter(
    (card) =>
      card.state === "waiting" ||
      card.state === "shrinking" ||
      card.state === "uploading" ||
      (card.state === "done" && card.imageId != null && !listed.has(card.imageId)),
  ).length;
}

type Props = {
  /** Injected by tests, which cannot send a multipart body through jsdom. */
  upload?: UploadFn;
  shrinker?: ShrinkFn;
};

/**
 * The media library, for whoever holds `images.manage` (#105): how full it is,
 * adding photos, browsing them with where each one is shown, and deleting the
 * unused ones. It places nothing: a photo is placed on the page that shows it,
 * through the SlotPhotoControl on each slot there.
 *
 * A SELECTION LARGER THAN THE ROOM LEFT IS STILL QUEUED WHOLE. The notice says
 * how many places remain and the server refuses the rest with
 * `image_library_full`, card by card. Trimming the selection here instead
 * would drop the wrong files: a photo the library already holds comes back as
 * a duplicate and takes no place, and only the server can tell which those
 * are.
 */
export function Media({ upload, shrinker }: Props = {}) {
  const summary = useImageSummary();
  const library = useImageIndex();
  const images = rowsOf<ImageResource>(library.data);
  const queue = useUploadQueue({ upload, shrinker });
  const input = useRef<HTMLInputElement>(null);
  const [placesLeft, setPlacesLeft] = useState<number | null>(null);

  const counts = summary.data?.status === 200 ? summary.data.data : null;
  const listed = new Set(images.map((image) => image.id));

  function add(files: FileList) {
    if (counts) {
      const left = Math.max(0, counts.capacity - counts.count - claimed(queue.cards, listed));
      setPlacesLeft(files.length > left ? left : null);
    }
    queue.add(files);
  }

  return (
    <PageSection>
      <h1 className="font-display text-4xl">{t("photos.heading")}</h1>

      <div className="mt-related flex flex-col gap-related">
        {counts ? (
          <p data-testid="photos-summary" className="text-ink-muted">
            {t("photos.summary", {
              n: counts.count,
              capacity: counts.capacity,
              size: megabytes(counts.bytesTotal),
            })}
          </p>
        ) : null}

        <div>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="photos-input"
            onChange={(event) => {
              if (event.target.files?.length) {
                add(event.target.files);
              }
              // The same file chosen twice must still fire a change.
              event.target.value = "";
            }}
          />
          <Button type="button" onClick={() => input.current?.click()}>
            <Plus aria-hidden="true" />
            {t("photos.add")}
          </Button>
        </div>
        <p className="text-sm text-ink-muted">{t("photos.consent")}</p>

        {/* A live region, unlike Notice on its own: this appears in answer to
            the selection just made. */}
        <div role="status">
          {placesLeft !== null ? (
            <Notice>{t("photos.placesLeft", { count: placesLeft })}</Notice>
          ) : null}
        </div>

        <UploadCards
          cards={unlisted(queue.cards, listed)}
          onRetry={queue.retry}
          onRetryAll={queue.retryAllFailed}
          testId="upload-cards"
        />
      </div>

      <section className="mt-block" aria-labelledby="library-heading">
        <h2 id="library-heading" className="mb-related font-display text-2xl">
          {t("photos.libraryHeading")}
        </h2>
        {library.isError ? (
          <p role="alert" className="text-danger">
            {t("photos.loadFailed")}
          </p>
        ) : library.isPending ? (
          <p className="text-ink-muted">{t("common.loading")}</p>
        ) : (
          <LibraryGrid images={images} />
        )}
      </section>
    </PageSection>
  );
}

import { Plus, X } from "lucide-react";
import { useRef } from "react";

import { rowsOf } from "../api/collection";
import { useImageIndex } from "../api/generated/endpoints";
import type { ImageResource } from "../api/generated/model";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "../i18n";
import { PHOTO_SIZES } from "./Photo";
import { UploadCards, unlisted } from "./UploadCards";
import type { ShrinkFn, UploadFn } from "./uploadQueue";
import { useUploadQueue } from "./useUploadQueue";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (image: ImageResource) => void;
  /**
   * Offers "Retirer la photo" above the library and calls this when it is
   * chosen. For a page slot that shows a photo now; a form passes nothing.
   */
  onRemove?: (() => void) | undefined;
  /** Injected by tests, which cannot send a multipart body through jsdom. */
  upload?: UploadFn;
  shrinker?: ShrinkFn;
};

/**
 * Chooses a photo from the library, newest first, and adds new ones to it.
 *
 * Uploads go through the same queue as the library screen, so a photo added
 * here is shrunk the same way, and its card leaves the status list once the
 * library lists it (see `unlisted`).
 */
export function PhotoPicker({ open, onOpenChange, onPick, onRemove, upload, shrinker }: Props) {
  const library = useImageIndex(undefined, { query: { enabled: open } });
  const images = rowsOf<ImageResource>(library.data);
  const queue = useUploadQueue({ upload, shrinker });
  const input = useRef<HTMLInputElement>(null);

  const pending = unlisted(queue.cards, new Set(images.map((image) => image.id)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle>{t("photos.pickerTitle")}</DialogTitle>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t("photos.close")}>
                <X />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription>{t("photos.pickerDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            multiple
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="photo-picker-input"
            onChange={(event) => {
              if (event.target.files?.length) {
                queue.add(event.target.files);
              }
              // The same file chosen twice must still fire a change.
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => input.current?.click()}>
            <Plus aria-hidden="true" />
            {t("photos.add")}
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              {t("photos.removeFromSlot")}
            </Button>
          ) : null}
        </div>

        <UploadCards
          cards={pending}
          onRetry={queue.retry}
          onRetryAll={queue.retryAllFailed}
          testId="photo-picker-cards"
        />

        {library.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {t("photos.loadFailed")}
          </p>
        ) : images.length === 0 && !library.isPending ? (
          <p className="text-sm text-muted-foreground">{t("photos.pickerEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="photo-picker-grid">
            {images.map((image) => (
              <li key={image.id}>
                {/* Named by the photo's name, which it shows under the
                    thumbnail: the button's accessible name is that text. */}
                <button
                  type="button"
                  className="flex min-h-touch w-full flex-col overflow-hidden rounded-md border text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  onClick={() => {
                    onPick(image);
                    onOpenChange(false);
                  }}
                >
                  <img
                    src={image.url}
                    srcSet={image.srcset}
                    sizes={PHOTO_SIZES.pickerTile}
                    width={image.width}
                    height={image.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/3] w-full object-cover"
                  />
                  <span className="line-clamp-2 px-2 py-1 text-sm wrap-anywhere">{image.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

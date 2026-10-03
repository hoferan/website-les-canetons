import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import {
  getBandIndexQueryKey,
  getImageIndexQueryKey,
  getSitePhotoIndexQueryKey,
  photoPlacementShow,
  photoPlacementUpdate,
} from "../api/generated/endpoints";
import type { PhotoPlacementsResource, UpdatePhotoPlacementsRequest } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { cn } from "@/lib/utils";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { Photo, PHOTO_SIZES, type PhotoData } from "./Photo";
import { PhotoPicker } from "./PhotoPicker";
import type { ShrinkFn, UploadFn } from "./uploadQueue";
import { useUploadQueue } from "./useUploadQueue";

/** A page slot a photo can be placed in. */
export type PhotoSlot =
  { kind: "band" } | { kind: "concert" } | { kind: "register"; sectionId: number; name: string };

type Read = { document: PhotoPlacementsResource; etag: string };

/** The read as a PUT body, with `imageId` placed in the one slot and every other slot as it was read. */
export function placementsWith(
  document: PhotoPlacementsResource,
  slot: PhotoSlot,
  imageId: number | null,
): UpdatePhotoPlacementsRequest {
  return {
    band: { imageId: slot.kind === "band" ? imageId : document.band.imageId },
    concert: { imageId: slot.kind === "concert" ? imageId : document.concert.imageId },
    registers: document.registers.map((row) => ({
      sectionId: row.sectionId,
      imageId: slot.kind === "register" && slot.sectionId === row.sectionId ? imageId : row.imageId,
    })),
  };
}

/** The accessible name, which says which of /band's seven slots the control belongs to. */
function labelOf(slot: PhotoSlot, add: boolean): string {
  switch (slot.kind) {
    case "band":
      return t(add ? "photos.addBand" : "photos.changeBand");
    case "concert":
      return t(add ? "photos.addConcert" : "photos.changeConcert");
    case "register":
      return t(add ? "photos.addRegister" : "photos.changeRegister", { name: slot.name });
  }
}

/**
 * A browser without a type for the file (some HEIC exports, for one) is given
 * the benefit of the doubt: the shrink step decodes it or says why it cannot.
 */
function looksLikePhoto(file: File): boolean {
  return file.type === "" || file.type.startsWith("image/");
}

type Props = {
  slot: PhotoSlot;
  /** What the slot holds now; null draws the empty frame. */
  photo: PhotoData | null;
  /** Used when the photo carries no alt text in either language. */
  fallbackAlt: string;
  /** Injected by tests, which cannot send a multipart body through jsdom. */
  upload?: UploadFn | undefined;
  shrinker?: ShrinkFn | undefined;
};

/**
 * One page slot as an editor sees it (#105): the band photo and each
 * register's on /band, the concert photo on the home page. `SlotPhoto` renders
 * this only for whoever holds `images.manage`.
 *
 * An empty slot is a single button the size of the photo it waits for, so the
 * whole frame means "put a photo here". A placed photo carries a pencil in its
 * corner. Either opens the library picker; a pick, or "Retirer la photo" when
 * the slot has one, saves at once.
 *
 * On a desktop a file can also be dragged onto the frame, empty or not. It goes
 * through the same upload queue as the picker and /media, so it is shrunk and
 * sent exactly as they send it, and the image the server answers with is
 * placed here by the same write a pick makes.
 *
 * THE READ HAPPENS AS THE PICKER OPENS, or as the file is dropped, and the
 * write quotes its tag. The placements are one document and the PUT replaces
 * all of it, so the body is that read with this one slot changed. If somebody
 * placed a photo anywhere else in between, the write answers 412 and the
 * notice under the frame says so, rather than this write undoing theirs. A
 * fresh read just before the write would satisfy the server and protect
 * nobody; see web/src/api/ifMatch.ts.
 */
export function SlotPhotoControl({ slot, photo, fallbackAlt, upload, shrinker }: Props) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("photos.slotSaveFailed"));
  const queue = useUploadQueue({ upload, shrinker });
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // dragenter and dragleave fire for every child the pointer crosses, so the
  // frame counts them rather than trusting the last one.
  const depth = useRef(0);
  const read = useRef<Promise<Read> | null>(null);
  const manages = can("images.manage");

  // A file dropped beside a frame would open in the tab and leave the page,
  // taking any upload in progress with it. While an editor has a slot on
  // screen, a file drag that no frame took is refused at the document, so the
  // cursor shows it cannot land there. Links and text keep the browser's own
  // behaviour, and so does every page without a slot.
  useEffect(() => {
    if (!manages) return;
    const refuse = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented) return;
      if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
      event.preventDefault();
      if (event.type === "dragover" && event.dataTransfer) {
        event.dataTransfer.dropEffect = "none";
      }
    };
    document.addEventListener("dragover", refuse);
    document.addEventListener("drop", refuse);
    return () => {
      document.removeEventListener("dragover", refuse);
      document.removeEventListener("drop", refuse);
    };
  }, [manages]);

  if (!manages) {
    return null;
  }

  const droppedCard = queue.cards.find((card) => card.id === dropped);
  const progress = saving
    ? t("common.busy")
    : droppedCard
      ? t(`photos.state.${droppedCard.state}`)
      : null;
  const busy = progress !== null;

  function beginRead() {
    form.clear();
    setNotice(null);
    read.current = photoPlacementShow().then((response) => {
      const etag = entityTagOf(response);
      // The mutator throws on every non-2xx, so this only narrows the type.
      if (response.status !== 200 || etag === null) {
        throw new Error("The placements read carried no entity tag");
      }
      return { document: response.data, etag };
    });
    // Settled here so an abandoned read is not an unhandled rejection; save()
    // awaits the same promise and reports its failure.
    read.current.catch(() => {});
  }

  async function save(imageId: number | null) {
    if (!read.current || saving) return;
    setSaving(true);
    try {
      const { document, etag } = await read.current;
      await photoPlacementUpdate(placementsWith(document, slot, imageId), ifMatch(etag));
      // The page shows the slot, and the library lists where each photo is.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getSitePhotoIndexQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getBandIndexQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
      ]);
    } catch (thrown) {
      form.setFromThrown(thrown);
    } finally {
      read.current = null;
      setSaving(false);
    }
  }

  async function place(file: File) {
    beginRead();
    const [id] = queue.add([file]);
    if (!id) return;
    setDropped(id);
    const card = await queue.settled(id);
    setDropped(null);
    if (card.state !== "failed" && card.imageId != null) {
      await save(card.imageId);
    } else {
      read.current = null;
      setNotice(t(`photos.reason.${card.reason ?? "network"}`));
    }
  }

  function open() {
    if (busy) return;
    beginRead();
    setPicking(true);
  }

  const carriesFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  // Every drag is accepted, so a link or a second file dropped here gets a
  // message instead of the browser opening it in place of the page.
  const dropTarget = {
    onDragEnter(event: DragEvent) {
      event.preventDefault();
      depth.current += 1;
      if (!busy && carriesFiles(event)) setDragging(true);
    },
    onDragOver(event: DragEvent) {
      event.preventDefault();
      event.dataTransfer.dropEffect = busy ? "none" : "copy";
    },
    onDragLeave() {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop(event: DragEvent) {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (busy) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      const [file] = files;
      if (files.length > 1) {
        form.clear();
        setNotice(t("photos.dropOnlyOne"));
      } else if (!file || !looksLikePhoto(file)) {
        form.clear();
        setNotice(t("photos.dropNotPhoto"));
      } else {
        void place(file);
      }
    },
  };

  const label = labelOf(slot, photo === null);

  return (
    <div className="mt-related">
      <div
        className="group/frame relative"
        {...(photo ? { "data-photo-frame": "" } : { "data-photo-pending": slot.kind })}
        {...dropTarget}
      >
        {photo ? (
          <>
            <Photo
              photo={photo}
              fallbackAlt={fallbackAlt}
              sizes={PHOTO_SIZES.textColumn}
              className="block h-auto w-full rounded-lg"
            />
            {/* Icon only on a phone (ADR 0025): the pencil means one thing and
                the name says which slot. From sm up, hovering the photo or
                focusing the pencil shows the word too. White and shadowed so
                it reads on a dark or a light photograph; h-11 and min-w-11
                keep the 44px touch target. */}
            <button
              type="button"
              aria-label={label}
              aria-disabled={busy}
              onClick={open}
              className="group/pencil absolute right-2 bottom-2 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-white/90 px-3 text-ink shadow-md outline-none hover:bg-white focus-visible:ring-[3px] focus-visible:ring-ring aria-disabled:opacity-60"
            >
              <Pencil aria-hidden="true" className="size-5 shrink-0" />
              <span className="hidden pr-1 text-sm font-medium sm:group-hover/frame:inline sm:group-focus-visible/pencil:inline">
                {t("photos.change")}
              </span>
            </button>
          </>
        ) : (
          // The same frame as a placed photo and as a visitor's placeholder:
          // 3:2, the column's width, rounded-lg.
          <button
            type="button"
            aria-label={label}
            aria-disabled={busy}
            onClick={open}
            className="flex aspect-[3/2] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-violet/70 bg-violet/5 px-4 text-center text-ink outline-none transition-colors hover:border-violet hover:bg-violet/10 focus-visible:border-violet focus-visible:bg-violet/10 focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <ImagePlus aria-hidden="true" className="mb-1 size-10 text-violet" strokeWidth={1.5} />
            <span className="font-medium">{t("photos.addOne")}</span>
            <span className="text-sm text-ink-muted">{t("photos.addFrom")}</span>
          </button>
        )}

        {dragging || busy ? (
          <div
            aria-hidden="true"
            // Opaque over the empty frame, whose own words would show through;
            // over a photo it lets the picture show, blurred, as the thing
            // being replaced.
            className={cn(
              "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-violet px-4 text-center font-medium text-violet",
              photo
                ? "bg-panel/85 backdrop-blur-sm"
                : "bg-panel bg-linear-to-b from-violet/10 to-violet/10",
            )}
          >
            {dragging ? (
              <>
                <ImagePlus className="size-10" strokeWidth={1.5} />
                {t("photos.dropHere")}
              </>
            ) : (
              <>
                <LoaderCircle className="size-8 animate-spin" />
                {progress}
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Always in the tree, so the change of text is announced. */}
      <p role="status" className="sr-only">
        {progress}
      </p>
      <FormError error={form.error ?? (notice ? { message: notice, fields: [] } : null)} />

      <PhotoPicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(image) => void save(image.id)}
        onRemove={photo ? () => void save(null) : undefined}
        upload={upload}
        shrinker={shrinker}
      />
    </div>
  );
}

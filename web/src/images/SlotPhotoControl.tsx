import { useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, Pencil } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";

import {
  getBandIndexQueryKey,
  getImageIndexQueryKey,
  getSitePhotoIndexQueryKey,
  photoPlacementRegister,
  photoPlacementSite,
} from "../api/generated/endpoints";
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

/** Writes the one slot; no other slot is read or sent. */
function placeIn(slot: PhotoSlot, imageId: number | null) {
  return slot.kind === "register"
    ? photoPlacementRegister(slot.sectionId, { imageId })
    : photoPlacementSite(slot.kind, { imageId });
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
  /** What the photo shows, said by the page: the band's name or the register's. */
  alt: string;
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
 * Each slot is written on its own and carries no `If-Match`: it is one value,
 * so a placement somebody makes elsewhere is never touched by this one.
 *
 * FOCUS STAYS ON THE SLOT. The button that opened the picker is replaced when
 * the slot fills or empties (the add frame becomes a pencil, or back), so the
 * dialog hands focus back to a button that is about to go. Once the page shows
 * the new state, focus moves to the slot's new button, and the status line
 * says what happened.
 */
export function SlotPhotoControl({ slot, photo, alt, upload, shrinker }: Props) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("photos.slotSaveFailed"));
  const queue = useUploadQueue({ upload, shrinker });
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  // dragenter and dragleave fire for every child the pointer crosses, so the
  // frame counts them rather than trusting the last one.
  const depth = useRef(0);
  const control = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const manages = can("images.manage");
  const placed = photo !== null;

  // Runs once the page has re-rendered the slot, so `control` is the new
  // button. Only when focus went with the old one: a drop made while the
  // editor works elsewhere on the page leaves their focus where it is.
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    const active = document.activeElement;
    if (active === null || active === document.body || !active.isConnected) {
      control.current?.focus();
    }
  }, [placed]);

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

  function reset() {
    form.clear();
    setNotice(null);
    setOutcome(null);
  }

  async function save(imageId: number | null) {
    if (saving) return;
    setSaving(true);
    try {
      await placeIn(slot, imageId);
      // Set before the refetch below makes the page re-render the slot, and
      // only when it swaps the button: a new photo over an old one keeps the
      // pencil, which the dialog has already focused.
      refocus.current = (imageId === null) === placed;
      // The page shows the slot, and the library lists where each photo is.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getSitePhotoIndexQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getBandIndexQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
      ]);
      setOutcome(t(imageId === null ? "photos.slotRemoved" : "photos.slotPlaced"));
    } catch (thrown) {
      form.setFromThrown(thrown);
    } finally {
      setSaving(false);
    }
  }

  async function place(file: File) {
    reset();
    const [id] = queue.add([file]);
    if (!id) return;
    setDropped(id);
    const card = await queue.settled(id);
    setDropped(null);
    if (card.state !== "failed" && card.imageId != null) {
      await save(card.imageId);
    } else {
      setNotice(t(`photos.reason.${card.reason ?? "network"}`));
    }
  }

  function open() {
    if (busy) return;
    reset();
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
        reset();
        setNotice(t("photos.dropOnlyOne"));
      } else if (!file || !looksLikePhoto(file)) {
        reset();
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
              alt={alt}
              sizes={PHOTO_SIZES.textColumn}
              className="block h-auto w-full rounded-lg"
            />
            {/* Icon only on a phone (ADR 0025): the pencil means one thing and
                the name says which slot. From sm up, hovering the photo or
                focusing the pencil shows the word too. White and shadowed so
                it reads on a dark or a light photograph; h-11 and min-w-11
                keep the 44px touch target. */}
            <button
              ref={control}
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
          // Shaped like the photo it waits for, 3:2 at the column's width,
          // where a visitor gets one line (see PhotoPending).
          <button
            ref={control}
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
        {progress ?? outcome}
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

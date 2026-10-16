import { lazy, Suspense } from "react";

import { PhotoPending, PhotoReserved } from "@/components/PhotoPending";

import { useSession } from "../session/SessionProvider";
import { Photo, PHOTO_SIZES } from "./Photo";
import { usePhotoSlots } from "./photoSlots";
import type { ShrinkFn, UploadFn } from "./uploadQueue";

// A chunk of its own, with the drop zone, the picker and the upload queue it
// pulls in (#294). Only an editor renders it, so no visitor downloads them.
const SlotPhotoControl = lazy(() =>
  import("./SlotPhotoControl").then((module) => ({ default: module.SlotPhotoControl })),
);

type Props = {
  /**
   * The slot's name, unique across the site: `band`, `register-5`, a GUID. A
   * new name is a new slot, with nothing to add on the server.
   */
  slot: string;
  /** What the slot is, in the page's words; see SlotPhotoControl. */
  label: string;
  /** What the photo shows, said by the page. No photo carries alt text. */
  alt: string;
  /** Injected by tests, which cannot send a multipart body through jsdom. */
  upload?: UploadFn;
  shrinker?: ShrinkFn;
};

/**
 * One photo slot (#105): put it on a page with a name and it shows whatever is
 * placed there, and lets whoever holds `images.manage` change it in place. It
 * reads the slots itself, so a page passes no photo.
 *
 * A visitor gets the photo or the one-line placeholder, with no
 * control, no drop handling and no wrapper. An editor gets `SlotPhotoControl`,
 * which draws the same photo with a way to change it.
 *
 * While the slots are on their way the frame is reserved without a caption, so
 * the placeholder does not flash and nothing below moves when a photo arrives.
 * The same goes while an editor's control is loading: the fallback is the box
 * the control draws, the photo in its wrapper or the empty 3:2 frame, and the
 * pencil or the add button then appears inside it.
 *
 * A placed photo fills the column at its own aspect ratio. `Photo` sends width
 * and height, so the box is reserved before the bytes arrive, and `h-auto` lets
 * the column width decide the height.
 */
export function SlotPhoto({ slot, label, alt, upload, shrinker }: Props) {
  const { can } = useSession();
  const slots = usePhotoSlots();

  if (slots.isPending) {
    return <PhotoReserved />;
  }
  const photo = slots.photoOf(slot);

  if (can("images.manage")) {
    return (
      <Suspense
        fallback={
          photo ? (
            <div className="mt-related">
              <Photo
                photo={photo}
                alt={alt}
                sizes={PHOTO_SIZES.textColumn}
                className="block h-auto w-full rounded-lg"
              />
            </div>
          ) : (
            <PhotoReserved />
          )
        }
      >
        <SlotPhotoControl
          slot={slot}
          label={label}
          photo={photo}
          alt={alt}
          upload={upload}
          shrinker={shrinker}
        />
      </Suspense>
    );
  }
  if (!photo) {
    return <PhotoPending token={slot} />;
  }
  return (
    <Photo
      photo={photo}
      alt={alt}
      sizes={PHOTO_SIZES.textColumn}
      className="mt-related h-auto w-full rounded-lg"
    />
  );
}

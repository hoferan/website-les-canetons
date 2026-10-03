import { PhotoPending } from "@/components/PhotoPending";

import { useSession } from "../session/SessionProvider";
import { Photo, PHOTO_SIZES, type PhotoData } from "./Photo";
import { SlotPhotoControl, type PhotoSlot } from "./SlotPhotoControl";
import type { ShrinkFn, UploadFn } from "./uploadQueue";

type Props = {
  slot: PhotoSlot;
  /** What the slot holds now; null shows the placeholder. */
  photo: PhotoData | null;
  /** What the photo shows, said by the page: the band's name or the register's. */
  alt: string;
  /** Injected by tests, which cannot send a multipart body through jsdom. */
  upload?: UploadFn;
  shrinker?: ShrinkFn;
};

/**
 * One page photo slot (#105): the photo, or the placeholder that stands in for
 * it. Whoever holds `images.manage` gets `SlotPhotoControl` instead, which
 * draws the same frame with a way to change it. A visitor gets no control, no
 * drop handling and no wrapper, so the page is laid out as before.
 *
 * A placed photo fills the column at its own aspect ratio. `Photo` sends width
 * and height, so the box is reserved before the bytes arrive, and `h-auto` lets
 * the column width decide the height. Every slot, on /band and on the home
 * page, spans the text column, which is what its `sizes` says.
 */
export function SlotPhoto({ slot, photo, alt, upload, shrinker }: Props) {
  const { can } = useSession();

  if (can("images.manage")) {
    return (
      <SlotPhotoControl slot={slot} photo={photo} alt={alt} upload={upload} shrinker={shrinker} />
    );
  }
  if (!photo) {
    return <PhotoPending token={slot.kind} />;
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

import { lazy, Suspense, type ReactNode } from "react";

import { useEditMode } from "../content/EditMode";
import { useSession } from "../session/SessionProvider";
import type { PhotoData } from "./Photo";
import { usePhotoSlots } from "./photoSlots";

// The same chunk SlotPhoto loads, for editors only (#294).
const SlotPhotoControl = lazy(() =>
  import("./SlotPhotoControl").then((module) => ({ default: module.SlotPhotoControl })),
);

/**
 * A photo slot for a page that draws the picture itself, in a frame of its
 * own, and shows something else while nothing is placed (the home hero's
 * badge). `SlotPhoto` draws a text-column photo and a placeholder; this hands
 * the slot's photo, or null, to `render` and draws nothing but what it returns.
 *
 * `reserved` stands in while the slots are on their way, so the page neither
 * shows the fallback and then swaps it for the photo, nor moves when it lands.
 *
 * An editor with edit mode on gets the slot's button (`SlotPhotoControl`,
 * compact) under the picture. With edit mode off they see what a visitor sees.
 */
export function SlotPicture({
  slot,
  label,
  alt,
  reserved,
  render,
}: {
  slot: string;
  label: string;
  alt: string;
  reserved: ReactNode;
  render: (photo: PhotoData | null) => ReactNode;
}) {
  const { can } = useSession();
  const editMode = useEditMode();
  const slots = usePhotoSlots();

  if (slots.isPending) return reserved;
  const photo = slots.photoOf(slot);

  return (
    <>
      {render(photo)}
      {editMode.on && can("images.manage") ? (
        <Suspense fallback={null}>
          <SlotPhotoControl slot={slot} label={label} photo={photo} alt={alt} compact />
        </Suspense>
      ) : null}
    </>
  );
}

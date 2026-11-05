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
 * While the slots are on their way `render(null)` is drawn, so the fallback is
 * on screen at once and never waits on the slots' request (the home hero's
 * badge is the page's largest paint). A placed photo then replaces it, which
 * must not move the page: the frame it is drawn in has a fixed size.
 *
 * An editor with edit mode on gets the slot's button (`SlotPhotoControl`,
 * compact) under the picture. With edit mode off they see what a visitor sees.
 */
export function SlotPicture({
  slot,
  label,
  alt,
  render,
}: {
  slot: string;
  label: string;
  alt: string;
  render: (photo: PhotoData | null) => ReactNode;
}) {
  const { can } = useSession();
  const editMode = useEditMode();
  const slots = usePhotoSlots();

  const photo = slots.photoOf(slot);

  return (
    <>
      {render(photo)}
      {!slots.isPending && editMode.on && can("images.manage") ? (
        <Suspense fallback={null}>
          <SlotPhotoControl slot={slot} label={label} photo={photo} alt={alt} compact />
        </Suspense>
      ) : null}
    </>
  );
}

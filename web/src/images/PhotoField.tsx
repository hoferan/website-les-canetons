import { useState } from "react";

import type { ImageResource } from "../api/generated/model";
import { Button } from "@/components/ui/button";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { Photo, PHOTO_SIZES, type PhotoData } from "./Photo";
import { PhotoPicker } from "./PhotoPicker";

type Props = {
  label: string;
  /** The photo the API returned for the record, or null when it has none. */
  value: PhotoData | null;
  /**
   * The parent form holds an image id and the photo to show for it, so a pick
   * hands back both. Removing hands back two nulls.
   */
  onChange: (imageId: number | null, photo: PhotoData | null) => void;
};

/** A library image as the photo shape the API returns. */
function photoOf(image: ImageResource): PhotoData {
  return { url: image.url, width: image.width, height: image.height, srcset: image.srcset };
}

/**
 * A thumbnail with Choisir and Retirer. Without `images.manage` it shows only
 * the current thumbnail: an editor who may change a history entry but not the
 * library still has to see which photo is there.
 */
export function PhotoField({ label, value, onChange }: Props) {
  const { can } = useSession();
  const [picking, setPicking] = useState(false);
  const manage = can("images.manage");

  if (!manage && !value) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2" data-testid="photo-field">
      <span className="text-sm font-medium">{label}</span>
      {value ? (
        <Photo
          photo={value}
          alt={label}
          sizes={PHOTO_SIZES.formThumbnail}
          className="h-auto w-40 rounded-md border"
        />
      ) : null}
      {manage ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="raised-light" onClick={() => setPicking(true)}>
            {t("photos.choose")}
          </Button>
          {value ? (
            <Button type="button" variant="raised-light" onClick={() => onChange(null, null)}>
              {t("photos.remove")}
            </Button>
          ) : null}
          <PhotoPicker
            open={picking}
            onOpenChange={setPicking}
            onPick={(image) => onChange(image.id, photoOf(image))}
          />
        </div>
      ) : null}
    </div>
  );
}

import { cn } from "@/lib/utils";

import { t } from "../i18n";
import { Photo, PHOTO_SIZES, type PhotoData } from "../images/Photo";

/**
 * An event's poster on its card, opening at full size in a tab of its own,
 * where a phone can zoom it, save it or share it.
 *
 * The caller places it: on a phone it takes the card's first row at the
 * poster's own shape, and from `md` it is a 96px thumbnail at the card's
 * right edge, so the list stays easy to scan. Never cropped, because a poster
 * is read and a crop cuts its date.
 *
 * Last in the card's markup, after the details it illustrates, so a screen
 * reader meets the title first.
 */
export function EventPoster({
  poster,
  title,
  className,
}: {
  poster: PhotoData;
  title: string;
  className?: string;
}) {
  return (
    <a
      href={poster.url}
      target="_blank"
      rel="noreferrer"
      className={cn("block self-start md:w-24", className)}
    >
      <Photo
        photo={poster}
        alt={t("photos.slot.event", { title })}
        sizes={PHOTO_SIZES.eventPoster}
        className="h-auto w-full rounded-xl border-2 border-ink"
      />
    </a>
  );
}

import type { HistoryEntryResourcePhoto } from "../api/generated/model";
import { currentLocale } from "../i18n";

/**
 * The photo the API returns: its largest size, every size as a `srcset`, and
 * an alt text per language.
 * Typed after the history's, the one placement that carries alt text; the page
 * slots send the same shape with both alts null.
 */
export type PhotoData = NonNullable<HistoryEntryResourcePhoto>;

type Alts = { altFr?: string | null; altDe?: string | null };

/**
 * The alt text for the page's language, else the other language's, else the
 * fallback (ADR 0026's order). A blank string counts as missing, so a form that
 * saved "" does not hide the text in the other language.
 */
export function altFor(photo: Alts, fallback: string): string {
  const own = currentLocale() === "de-CH" ? [photo.altDe, photo.altFr] : [photo.altFr, photo.altDe];
  return own.find((text) => text != null && text.trim() !== "")?.trim() ?? fallback;
}

type Props = {
  photo: PhotoData;
  /** Used when the photo carries no alt text in either language. */
  fallbackAlt: string;
  /**
   * How wide the photo is drawn, as an HTML `sizes` value, so the browser
   * picks the smallest size in `srcset` that fills it. Each layout states its
   * own; see PHOTO_SIZES.
   */
  sizes: string;
  className?: string;
};

/**
 * The `sizes` of each place a photo is drawn, measured in Chromium at 390,
 * 700, 768, 1024 and 1280 px wide.
 *
 * The text column is 44rem (704 px) less PageSection's 16 px padding on each
 * side, so a photo spanning it is 672 px at most and the viewport less 32 px
 * below that. The shell is 72rem (1152 px) with the same padding. A library
 * card loses 18 px to its padding and border, and the grid's gaps are 16 px.
 */
export const PHOTO_SIZES = {
  /** /band and the home page: the photo spans the text column. */
  textColumn: "(min-width: 704px) 672px, calc(100vw - 32px)",
  /** /history: the text column less the timeline's indent and dot, 86 px in all. */
  timeline: "(min-width: 704px) 618px, calc(100vw - 86px)",
  /** The history form's 160 px thumbnail. */
  formThumbnail: "160px",
  /** A card of the /media grid: four columns from 1024 px, three from 640, two below. */
  libraryCard:
    "(min-width: 1152px) 250px, (min-width: 1024px) calc((100vw - 80px) / 4 - 18px), " +
    "(min-width: 640px) calc((100vw - 64px) / 3 - 18px), calc((100vw - 48px) / 2 - 18px)",
  /** A tile of the picker dialog: 200 px from 640 px up, two columns below. */
  pickerTile: "(min-width: 640px) 200px, calc((100vw - 78px) / 2)",
  /** The 48 px squares that name a photo in a delete dialog or its outcome. */
  icon: "48px",
} as const;

/**
 * `width` and `height` are always sent so the browser reserves the box before
 * the bytes arrive; without them a page of photos jumps as each one lands.
 * `src` is the largest size, for the rare browser that ignores `srcset`.
 */
export function Photo({ photo, fallbackAlt, sizes, className }: Props) {
  return (
    <img
      src={photo.url}
      srcSet={photo.srcset}
      sizes={sizes}
      width={photo.width}
      height={photo.height}
      alt={altFor(photo, fallbackAlt)}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

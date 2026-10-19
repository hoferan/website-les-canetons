import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * There are two logos. `Logo` is the header lockup: the duck mark beside the
 * band's name set in Bungee. `BrandLogo` is the original artwork, the
 * black-and-red badge printed on the flyers, costumes and instruments, shown
 * where it can be read.
 *
 * The header does not use the artwork: at header size its baked-in lettering
 * is illegible, it would repeat the live text beside it, and words inside a
 * JPEG are invisible to a screen reader and to search. The duck is narrower
 * than the badge, so the name fits on one line at 390px. It comes from the
 * same artwork, as does the favicon.
 */
export function Logo() {
  return (
    // aria-label so the accessible name is one phrase, not the wordmark and
    // "Guggenmusik" run together.
    //
    // The label must not contain "accueil": name matching can be substring
    // and case insensitive, so a query for a link such as "Retour à
    // l'accueil" would also match the logo and fail on strict mode.
    <Link
      to="/"
      aria-label="Les Canetons de Fribourg"
      className="focus-ring-stage flex items-center gap-3 rounded"
    >
      {/* alt="": the wordmark beside it is real text saying the same thing.

          width/height are the file's intrinsic pixels, there to reserve the
          box (the CSS sizes it). Without them `w-auto` computes to 0 until the
          bytes arrive, and the wordmark jumps right when the image lands. */}
      <img
        src="/assets/img/duck-white.png"
        alt=""
        width={139}
        height={172}
        className="h-12 w-auto sm:h-16"
      />

      {/* Spans, not an <h1>: the page's own title is the document's single
          h1, and the site name in the header is branding. */}
      <span className="flex flex-col leading-none">
        {/* No accent colour: pink here would compete with the duck's red
            beak. Colour in the header means the mark, colour in the nav means
            state. */}
        <span className="font-display text-lg leading-tight sm:text-2xl sm:leading-none">
          Les Canetons de Fribourg
        </span>
        <span className="mt-1.5 text-[10px] font-bold tracking-[0.28em] text-white/70 uppercase sm:text-[11px] sm:tracking-[0.3em]">
          Guggenmusik
        </span>
      </span>
    </Link>
  );
}

/**
 * The band's real badge, at a size where it can actually be read.
 *
 * Content, not decoration, hence a described `alt`. Kept out of the header:
 * see the note above.
 *
 * width/height are the file's intrinsic pixels. This renders with `h-auto` and
 * a caller-supplied width, so without them the height is 0 until the bytes
 * arrive and the front page's hero jumps down when the image lands.
 *
 * No loading="lazy": this is the front page's hero image, above the fold on
 * every viewport, and lazy-loading would defer it and bring back the shift.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <img
      src="/assets/img/Les_Canetons_Fribourg_logo_2.jpg"
      alt="Le logo des Canetons de Fribourg"
      width={237}
      height={174}
      className={cn("h-auto rounded-lg", className)}
    />
  );
}

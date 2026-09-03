import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * THERE ARE TWO LOGOS, AND THE DIFFERENCE IS THE WHOLE POINT OF THIS FILE.
 *
 * `Logo` is the header LOCKUP: the duck mark beside the band's name set in
 * Bungee. `BrandLogo` is the ORIGINAL ARTWORK — the black-and-red badge that is
 * printed on the flyers, the costumes and the instruments. That one is what
 * people actually recognize, so it is not retired; it is moved somewhere it can
 * be seen at a readable size.
 *
 * WHY THE HEADER STOPPED USING THE ARTWORK. It was rendered at 64px, where its
 * baked-in lettering — "GUGGENMUSIK / LES CANETONS / FRIBOURG" — is illegible,
 * and it sat directly beside live text saying the same words. So the header
 * showed the band's name twice, once as noise. Worse, the words inside a JPEG
 * are invisible to a screen reader and to search. Splitting the mark from the
 * wordmark fixes all three at once, and the duck is narrower than the badge, so
 * the name now fits on ONE line at 390px instead of wrapping to two.
 *
 * The duck is not new: it was extracted from that same artwork, and the site's
 * favicon has been the duck on black all along.
 */
export function Logo() {
  return (
    // A link, because a header logo that does not go home is a small friction
    // on every page. aria-label rather than the visible text alone so the
    // accessible name stays one clean phrase rather than the wordmark and
    // "Guggenmusik" run together.
    //
    // THE LABEL MUST NOT CONTAIN "accueil". It said "… — accueil" first, and
    // every e2e spec that resolves getByRole("link", { name: "Accueil" }) then
    // matched TWO elements — the nav item and this — and failed on a strict
    // mode violation. Accessible-name matching is substring and case
    // insensitive, so the site name alone is both the convention and the only
    // label that does not collide with the nav.
    <Link
      to="/"
      aria-label="Les Canetons de Fribourg"
      className="focus-ring flex items-center gap-3 rounded"
    >
      {/* alt="", deliberately: the wordmark beside it is real text saying the
          same thing, so describing the image repeats the band's name.

          width/height ARE THE FILE'S INTRINSIC PIXELS (139x172), and they are
          here to reserve the box rather than to size it — the CSS above still
          decides how big it renders. Without them the browser knows no aspect
          ratio until the bytes arrive, and `w-auto` computes to 0, so the
          wordmark beside it starts flush against the duck and jumps right when
          the image lands. Small, on every page of the site. */}
      <img
        src="/assets/img/duck-white.png"
        alt=""
        width={139}
        height={172}
        className="h-12 w-auto sm:h-16"
      />

      {/* Spans, not an <h1>. The page's own title is the document's single h1;
          a site name repeated in the header of every route is branding, not the
          heading of the content below it. Two h1s per page is what this was
          before, on all sixteen routes. */}
      <span className="flex flex-col leading-none">
        {/* NO ACCENT COLOUR HERE, AND THAT IS A DECISION. "Canetons" used to be
            pink, which put pink an inch from the duck's red beak — two accents
            competing in one lockup. The rule now: colour in the header means
            the MARK, colour in the nav means STATE. Pink keeps its one job. */}
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
 * Content, not decoration — hence a described `alt`. It is deliberately NOT in
 * the header: see the note above.
 *
 * width/height ARE THE FILE'S INTRINSIC PIXELS (237x174), and dropping them
 * costs 141px of layout shift on the front page. This renders with `h-auto` and
 * a caller-supplied width (`w-48 sm:w-64` on /accueil), so until the bytes
 * arrive the browser has no aspect ratio to work from, computes the height as 0,
 * and the whole hero — heading, sentence, photo slot, next event — sits 141px
 * higher and then jumps down when the image lands. Found on TEST: a measurement
 * taken a beat early read the badge as h=0 and the page looked like it had no
 * badge at all. With these attributes the box is reserved from the first paint.
 *
 * NO loading="lazy" — it used to be here and it was wrong. This is the front
 * page's hero image, above the fold on every viewport: lazy-loading defers the
 * one image a first-time visitor is meant to see, and on a slow connection it
 * guarantees the shift the attributes above exist to prevent. `lazy` is for
 * images below the fold, of which this site currently has none.
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

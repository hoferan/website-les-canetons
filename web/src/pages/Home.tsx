import { DestinationCards, type Destination } from "@/components/DestinationCards";
import { BrandLogo } from "@/components/Logo";
import { PageSection } from "@/components/PageSection";
import { PhotoPending } from "@/components/PhotoPending";

import { PublicAgenda } from "../events/PublicAgenda";

/**
 * The four pages a stranger most likely wants, in that order.
 *
 * A CURATED SUBSET OF THE NAV, ON PURPOSE — see DestinationCards.tsx. The nav
 * is the list of what exists; this is the list of what to read first.
 *
 * Each description says what is on the page it links to IN THE STATE THAT PAGE
 * SHIPS IN, not a promise about some finished version. /band today shows six
 * registers with a placeholder where the names go, because consent is opt-in
 * and nobody has been asked yet. So these are honest about the shipping site.
 * None of them asserts a fact about the band — those come from /history, or
 * from the band.
 */
const DESTINATIONS: Destination[] = [
  {
    to: "/join",
    title: "Nous rejoindre",
    description: "Les instruments recherchés, les horaires et les critères d’âge.",
  },
  {
    to: "/band",
    title: "Les canetons",
    description: "Les musiciens du groupe, registre par registre.",
  },
  {
    to: "/history",
    title: "Notre histoire",
    description: "Comment la guggen est née en 2002, et qui l’a dirigée depuis.",
  },
  {
    to: "/committee",
    title: "Le comité",
    description: "Nous écrire, réserver les Canetons, et qui fait quoi.",
  },
];

/**
 * The front door.
 *
 * IT WAS FAITHFUL PARITY, AND THAT WAS THE PROBLEM. The legacy home page was a
 * logo, the words "Bienvenue sur notre site", the navigation and one image: it
 * never said when the band was founded, what a Guggenmusik is, or who can
 * join. The first SPA reproduced that exactly, so the front page was a
 * content-free heading and a placeholder.
 *
 * THE HERO COPY IS A CONDENSATION OF /history, NOT NEW COPY. Nothing factual
 * is invented anywhere on this site — the `<Tbd />` count is the proof of how
 * seriously that is taken. Every clause below is already published on
 * /history, which is why this page did not have to wait for the band to write
 * anything. It still deserves their eyes once, and if they ever write two or
 * three sentences about themselves, those replace the one below.
 *
 * NO TUTOIEMENT. /join says "Tu veux commencer la guggen ?" because it
 * addresses children directly. A front door is read by parents and children
 * both, so the copy stays impersonal rather than inventing a register shift on
 * the site's most-read page.
 *
 * The agenda sits after the photograph slot and before the destinations: the
 * hero says what the band is, the agenda says what it is doing next, and
 * somebody still reading after both is the person who wants to go somewhere.
 * It is the only thing here that changes by itself, and it is allowed to
 * render nothing.
 */
export function Home() {
  return (
    <PageSection width="text">
      {/* The band's badge — the mark people know from the flyers, the costumes
          and the instruments — as the hero's mark. It sits here because the
          header carries the duck as its own mark beside a live-text wordmark;
          see Logo.tsx for why.

          THIS IS THE BADGE'S ONLY PLACEMENT ON THE SITE. It was briefly in the
          footer too, and dropped on 2026-09-03: shown in the chrome of every
          page it stopped being the thing you recognise and became wallpaper.
          One prominent placement beats two quiet ones.

          Narrower below `sm`. Measured at 390px: w-48 renders 192×141 and w-64
          renders 256×188, so dropping to w-48 saves 47px of hero height rather
          than the 64px of width the class name suggests, because the image
          keeps its aspect ratio. */}
      <BrandLogo className="mx-auto w-48 sm:w-64" />

      {/* text-3xl below `sm`. Bungee is a signage face whose lowercase glyphs
          are drawn as CAPITALS, so this line sets as caps whatever the source
          says and is far wider than Karla at the same size. That width is why
          it wraps at all — but it wraps to FOUR lines at EITHER size: measured
          at 390px (358px available inside PageSection's padding), text-3xl is
          30px/36px and text-4xl is 36px/40px, and `Range.getClientRects()` on
          the text node reports 4 lines both times. text-3xl does not buy a
          line, it buys 4px of line-height per line: 144px against 160px, 16px
          in total. A real if modest saving, not the difference between a
          two-line and a four-line heading. A sentence-case heading is not
          available while this face is in use; that is the look, not a bug. */}
      <h1 className="mt-block font-display text-3xl sm:text-4xl">
        La guggen d’enfants de Fribourg, depuis 2002.
      </h1>

      {/* ONE sentence, not a paragraph, and it carries the only practically
          useful facts: Saturday mornings, and no experience needed. That is
          what somebody deciding whether to turn up needs. */}
      <p className="mt-related text-lg text-ink-muted">
        De 7 à 18 ans — et pas besoin de connaître la musique&nbsp;: les moniteurs apprennent les
        morceaux registre par registre, aux répétitions du samedi matin.
      </p>

      <PhotoPending what="des Canetons en concert" />

      <PublicAgenda />

      <DestinationCards label="Découvrir les Canetons" destinations={DESTINATIONS} />
    </PageSection>
  );
}

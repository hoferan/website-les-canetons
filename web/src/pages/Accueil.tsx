import { NextEvent } from "../components/NextEvent";
import { PhotoPending } from "../components/PhotoPending";
import { SouperCta } from "../components/SouperCta";
import { PageSection } from "@/components/PageSection";
import { BrandLogo } from "@/components/Logo";

/**
 * The home page — the front door.
 *
 * IT WAS FAITHFUL PARITY, AND THAT WAS THE PROBLEM. The legacy home page was a
 * logo, the words "Bienvenue sur notre site", the navigation and one image: it
 * never said when the band was founded, what a Guggenmusik is, or who can join.
 * The SPA reproduced that exactly, so with the souper flag off the front page
 * was a content-free heading and a placeholder. See the E2b spec.
 *
 * THE HERO COPY IS A CONDENSATION OF /historique, NOT NEW COPY. Nothing factual
 * is invented anywhere on this site — the 23 `<Tbd>` fields blocking PROD are
 * the proof of how seriously that is taken. Every clause below is already
 * published on /historique, which is why this page did not have to wait for the
 * band to write anything. It still deserves their eyes once.
 *
 * The souper call-to-action stays FIRST and stays flag-gated: while it is on it
 * is the most time-sensitive thing on the site. It lives in its own component
 * because its two buttons link to /signup and /signups_admin.
 */
export function Accueil() {
  return (
    <PageSection width="text">
      <SouperCta />

      {/* The band's badge — the mark people know from the flyers, the costumes
          and the instruments — as the hero's mark. It sits here because the
          header now carries the duck as its own mark beside a live-text
          wordmark; see Logo.tsx for why.

          THIS IS THE BADGE'S ONLY PLACEMENT ON THE SITE. It was briefly in the
          footer too, and dropped on 2026-09-03: shown in the chrome of every
          page it stopped being the thing you recognize and became wallpaper.
          One prominent placement beats two quiet ones.

          Narrower below `sm`. It was a flat w-64 (256px) when this page was a
          heading and a box; above a hero that now has a display line and a
          sentence to read, 256px of duck on a 390px screen pushes the copy off
          the first screen. */}
      <BrandLogo className="mx-auto w-48 sm:w-64" />

      {/* text-3xl below `sm`. Bungee is a signage face whose lowercase glyphs
          are drawn as CAPITALS, so this line sets as caps whatever the source
          says and is far wider than Karla at the same size — at text-4xl it
          takes four lines on a 390px screen. A sentence-case heading is not
          available while this face is in use; that is the look, not a bug. */}
      <h1 className="mt-6 font-display text-3xl sm:text-4xl">
        La guggen d’enfants de Fribourg, depuis 2002.
      </h1>

      {/* ONE sentence, not a paragraph, and it carries the only practically
          useful facts: Saturday mornings, and no experience needed. That is
          what someone deciding whether to turn up needs.

          NO TUTOIEMENT. /commencement says "Tu veux commencer la guggen ?"
          because it addresses children directly; the members' area says "vous".
          A front door is read by parents and children both, so the copy stays
          impersonal — "pas besoin de connaître la musique" is the source's own
          phrasing — rather than inventing a register shift on the site's
          most-read page.

          IF THE BAND EVER WRITES TWO OR THREE SENTENCES ABOUT THEMSELVES, THEY
          REPLACE THIS ONE. That is the whole reason the page could ship without
          waiting for them, and why no <Tbd /> was put on the front page: the
          destination is the same page minus one paragraph. */}
      <p className="mt-4 text-lg text-ink-muted">
        De 7 à 18 ans — et pas besoin de connaître la musique&nbsp;: les moniteurs apprennent les
        morceaux registre par registre, aux répétitions du samedi matin.
      </p>

      <PhotoPending what="des Canetons en concert" />

      {/* AFTER the photo slot, per the E2b spec's page order: the hero says what
          the band is, and this says what it is doing next. It is the only thing
          on this page that changes by itself, and it is allowed to render
          nothing — see NextEvent.tsx. */}
      <NextEvent />
    </PageSection>
  );
}

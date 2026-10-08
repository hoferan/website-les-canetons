import { Drum, type LucideIcon, MessageSquare, Music, Star } from "lucide-react";

import { ButtonLink } from "@/components/ButtonLink";
import { DestinationCards } from "@/components/DestinationCards";
import { BrandLogo } from "@/components/Logo";
import { PageSection } from "@/components/PageSection";

import { useAgendaIndex } from "../api/generated/endpoints";
import { Confetti } from "../carnival/Confetti";
import { Highlighted } from "../carnival/Highlighted";
import { POSTER_CONFETTI } from "../carnival/PageHero";
import { Scallop } from "../carnival/Scallop";
import { SlotPhoto } from "../images/SlotPhoto";
import { PublicAgenda } from "../events/PublicAgenda";
import { type TranslationKey, t } from "../i18n";

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
const DESTINATIONS: {
  to: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  icon: LucideIcon;
  tint: string;
}[] = [
  {
    to: "/join",
    titleKey: "home.destinations.join.title",
    descriptionKey: "home.destinations.join.description",
    icon: Music,
    tint: "bg-pink",
  },
  {
    to: "/band",
    titleKey: "home.destinations.band.title",
    descriptionKey: "home.destinations.band.description",
    icon: Drum,
    tint: "bg-cyan",
  },
  {
    to: "/history",
    titleKey: "home.destinations.history.title",
    descriptionKey: "home.destinations.history.description",
    icon: Star,
    tint: "bg-lime",
  },
  {
    to: "/committee",
    titleKey: "home.destinations.committee.title",
    descriptionKey: "home.destinations.committee.description",
    icon: MessageSquare,
    tint: "bg-lilac",
  },
];

/** On yellow, the colours that are not yellow. */
const BAND_CONFETTI = ["var(--color-pink)", "var(--color-violet)", "#fff"];

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
  // The same query PublicAgenda reads, so React Query asks for it once.
  const agenda = useAgendaIndex();

  return (
    <>
      {/* THE POSTER HERO, ADR 0029. Full width, so it sits outside PageSection,
          with the shell width inside it. `pb-14` and up leave the Scallop room
          to draw over the bottom edge. */}
      <div className="relative overflow-hidden bg-poster text-white">
        <Confetti seed={11} colours={POSTER_CONFETTI} />
        <div className="relative mx-auto grid max-w-shell gap-block px-4 pt-8 pb-14 md:grid-cols-[1.4fr_1fr] md:items-center md:pt-16 md:pb-24">
          {/* The band's badge — the mark people know from the flyers, the
              costumes and the instruments — as the hero's mark, stuck on like
              a sticker. It sits here because the header carries the duck as
              its own mark beside a live-text wordmark; see Logo.tsx for why.

              THIS IS THE BADGE'S ONLY PLACEMENT ON THE SITE. It was briefly in
              the footer too, and dropped on 2026-09-03: shown in the chrome of
              every page it stopped being the thing you recognise and became
              wallpaper. One prominent placement beats two quiet ones.

              Narrower below `sm`. Measured at 390px: w-48 renders 192×141 and
              w-64 renders 256×188, so dropping to w-48 saves 47px of hero
              height rather than the 64px of width the class name suggests,
              because the image keeps its aspect ratio. */}
          <div data-confetti-avoid className="justify-self-center md:order-2">
            <BrandLogo className="w-48 rotate-[4deg] border-4 border-white shadow-raised sm:w-64 md:w-72" />
          </div>

          <div>
            {/* text-3xl below `sm`. Bungee is a signage face whose lowercase
                glyphs are drawn as CAPITALS, so this line sets as caps whatever
                the source says and is far wider than Karla at the same size.
                It wraps to four lines at 390px at either text-3xl or text-4xl;
                the smaller size saves 4px of line-height per line, not a line.
                A sentence-case heading is not available while this face is in
                use; that is the look, not a bug. */}
            <h1 data-confetti-avoid className="font-display text-3xl sm:text-4xl md:text-5xl">
              <Highlighted text={t("home.hero")} mark={t("home.heroHighlight")} />
            </h1>

            {/* ONE sentence, not a paragraph, and it carries the only
                practically useful facts: Saturday mornings, and no experience
                needed. That is what somebody deciding whether to turn up needs.
                White here is 5.3:1 at its worst, the top right of the
                paragraph at 390px, where the poster is pinkest under it. The
                gradient in styles.css runs the way it does to keep that above
                4.5:1. */}
            <p data-confetti-avoid className="mt-related max-w-text text-lg">
              {t("home.heroSub")}
            </p>

            {/* The two things a visitor most often comes to do, as the nav
                names them. */}
            <div data-confetti-avoid className="mt-block flex w-fit flex-wrap gap-3">
              <ButtonLink to="/join" variant="raised" className="h-12 px-5 text-base">
                {t("nav.join")}
              </ButtonLink>
              <ButtonLink to="/agenda" variant="raised-light" className="h-12 px-5 text-base">
                {t("nav.agenda")}
              </ButtonLink>
            </div>
          </div>
        </div>
        <Scallop into="var(--color-ground)" />
      </div>

      <PageSection>
        {/* The band's name is a proper noun, so it is the same alt in both
            languages. In the text column, which its `sizes` assumes. */}
        <div className="mx-auto max-w-text">
          <SlotPhoto
            slot="concert"
            label={t("photos.slot.concert")}
            alt="Les Canetons de Fribourg"
          />
        </div>

        <PublicAgenda />
      </PageSection>

      {/* Held until the agenda has answered, whatever the answer. The cards
          start inside a phone's first screen, so rendered while the agenda
          loads they were pushed down when its dates arrived (#236). They appear
          together with the agenda instead, in space nothing else occupies.

          On the yellow band, the one other surface on this page that takes
          confetti. */}
      {agenda.isPending ? null : (
        <div className="relative overflow-hidden bg-yellow">
          <Confetti seed={9} colours={BAND_CONFETTI} />
          <PageSection className="relative py-12 md:py-16">
            <DestinationCards
              label={t("home.discover")}
              destinations={DESTINATIONS.map((destination) => ({
                to: destination.to,
                title: t(destination.titleKey),
                description: t(destination.descriptionKey),
                icon: destination.icon,
                tint: destination.tint,
              }))}
            />
          </PageSection>
        </div>
      )}
    </>
  );
}

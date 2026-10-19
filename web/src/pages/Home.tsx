import { Drum, type LucideIcon, MessageSquare, Music, Star } from "lucide-react";

import { ButtonLink } from "@/components/ButtonLink";
import { DestinationCards } from "@/components/DestinationCards";
import { BrandLogo } from "@/components/Logo";
import { PageSection } from "@/components/PageSection";

import { useAgendaIndex } from "../api/generated/endpoints";
import { Confetti } from "../carnival/Confetti";
import { useFooterEdge } from "../carnival/footerEdge";
import { Highlighted } from "../carnival/Highlighted";
import { POSTER_CONFETTI } from "../carnival/PageHero";
import { Scallop } from "../carnival/Scallop";
import { SlotPhoto } from "../images/SlotPhoto";
import { PublicAgenda } from "../events/PublicAgenda";
import { type TranslationKey, t } from "../i18n";

/**
 * The four pages a stranger most likely wants, in that order.
 *
 * A curated subset of the nav (see DestinationCards.tsx): the nav lists what
 * exists, this lists what to read first.
 *
 * Each description says what the linked page shows as it ships, not a
 * promise about a finished version, and none asserts a fact about the band.
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
 * The hero copy condenses /history; nothing factual is invented anywhere on
 * this site (hence `<Tbd />`). If the band writes a few sentences about
 * themselves, those replace it.
 *
 * No tutoiement. /join addresses children directly ("Tu veux commencer la
 * guggen ?"), but the front door is read by parents and children both.
 *
 * The agenda sits after the photograph slot and before the destinations: the
 * hero says what the band is, the agenda what it does next, and somebody
 * still reading wants to go somewhere. The agenda may render nothing.
 */
export function Home() {
  // The same query PublicAgenda reads, so React Query asks for it once.
  const agenda = useAgendaIndex();
  // The yellow band is the page's last surface once it renders, and the
  // footer's scalloped edge is drawn in its colour.
  useFooterEdge(agenda.isPending ? null : "var(--color-yellow)");

  return (
    <>
      {/* The poster hero (ADR 0029). Full width, so it sits outside
          PageSection, with the shell width inside it. `pb-14` and up leave
          the Scallop room to draw over the bottom edge. */}
      <div className="relative overflow-hidden bg-poster text-white">
        <Confetti seed={11} colours={POSTER_CONFETTI} wobble />
        <div className="relative mx-auto grid max-w-shell gap-block px-4 pt-8 pb-14 md:grid-cols-[1.4fr_1fr] md:items-center md:pt-16 md:pb-24">
          {/* The band's badge, the mark people know from the flyers and
              costumes, stuck on like a sticker. The header carries the duck
              beside a live-text wordmark instead; see Logo.tsx.

              This is the badge's only placement: in the chrome of every page
              it would become wallpaper.

              Narrower below `sm`, which saves about 47px of hero height at
              390px, since the image keeps its aspect ratio. */}
          <div data-confetti-avoid className="justify-self-center md:order-2">
            <BrandLogo className="w-48 rotate-[4deg] border-4 border-white shadow-raised sm:w-64 md:w-72" />
          </div>

          <div>
            {/* Bungee draws its lowercase as capitals, so this line sets as
                caps whatever the source says, and is far wider than Karla at
                the same size. That is the look, not a bug.

                leading-[1.18] at every size, for the highlight's sake: see
                Highlighted.tsx. */}
            <h1
              data-confetti-avoid
              className="font-display text-3xl leading-[1.18] sm:text-4xl md:text-5xl"
            >
              <Highlighted text={t("home.hero")} mark={t("home.heroHighlight")} />
            </h1>

            {/* One sentence with the practical facts somebody deciding
                whether to turn up needs: Saturday mornings, no experience
                needed. White here is 5.3:1 at its worst (top right at 390px,
                where the poster is pinkest); the gradient in styles.css runs
                the way it does to keep that above 4.5:1. */}
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
          loads they would be pushed down when its dates arrive (#236).

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

import { Drum, type LucideIcon, MessageSquare, Music, Star } from "lucide-react";
import { useState } from "react";

import { DestinationCards } from "@/components/DestinationCards";
import { BrandLogo } from "@/components/Logo";
import { PageSection } from "@/components/PageSection";
import { cn } from "@/lib/utils";

import { useAgendaIndex } from "../api/generated/endpoints";
import { Confetti } from "../carnival/Confetti";
import { useFooterEdge } from "../carnival/footerEdge";
import { Highlighted } from "../carnival/Highlighted";
import { POSTER_CONFETTI } from "../carnival/PageHero";
import { Scallop } from "../carnival/Scallop";
import { Photo } from "../images/Photo";
import { SlotPhoto } from "../images/SlotPhoto";
import { SlotPicture } from "../images/SlotPicture";
import { PublicAgenda } from "../events/PublicAgenda";
import { type TranslationKey, t } from "../i18n";
import { useBlock } from "../content/BlocksProvider";
import { HeroActions, HeroEditor } from "../content/blocks/HeroBlock";
import { useBlockEditing } from "../content/blocks/useBlockEditing";
import { EditChip } from "../content/editor";
import { BLOCKS } from "../content/registry";
import { tr } from "../content/translated";

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

/**
 * The badge's frame: the sticker look and the sizes, for the badge and for a
 * picture the band places in its stead.
 *
 * Narrower below `sm`, which saves about 47px of hero height at 390px, since
 * the image keeps its aspect ratio.
 */
const BADGE_FRAME = "w-48 rotate-[4deg] border-4 border-white shadow-raised sm:w-64 md:w-72";

/** The `sizes` of that frame: its width at each breakpoint of BADGE_FRAME. */
const BADGE_SIZES = "(min-width: 768px) 288px, (min-width: 640px) 256px, 192px";

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
  const hero = useBlock("home.hero");
  const editing = useBlockEditing();
  const [editingHero, setEditingHero] = useState(false);
  const intro = hero.intro ? tr(hero.intro) : "";

  return (
    <>
      {/* The poster hero (ADR 0029). Full width, so it sits outside
          PageSection, with the shell width inside it. `pb-14` and up leave
          the Scallop room to draw over the bottom edge. */}
      <div className="relative overflow-hidden bg-poster text-white">
        <Confetti seed={11} colours={POSTER_CONFETTI} wobble />
        {/* In the header's own corner; the grid below makes room for it. */}
        {editing ? (
          <EditChip label={t(BLOCKS["home.hero"].label)} onClick={() => setEditingHero(true)} />
        ) : null}
        <div
          className={cn(
            "relative mx-auto grid max-w-shell gap-block px-4 pt-8 pb-14 md:grid-cols-[1.4fr_1fr] md:items-center md:pt-16 md:pb-24",
            editing && "pt-14 md:pt-16",
          )}
        >
          {/* The band's badge, the mark people know from the flyers and
              costumes, stuck on like a sticker. The header carries the duck
              beside a live-text wordmark instead; see Logo.tsx.

              This is the badge's only placement: in the chrome of every page
              it would become wallpaper.

              It is the `home.hero` photo slot's fallback: a picture the band
              places there takes the same frame, and the badge returns when it
              is removed. The slots load before either is drawn, so the badge
              does not flash and then swap; the reserved box has the badge's
              own proportions. */}
          <div
            data-confetti-avoid
            className="flex flex-col items-center justify-self-center md:order-2"
          >
            <SlotPicture
              slot="home.hero"
              label={t("photos.slot.homeHero")}
              alt={t("home.brandLogoAlt")}
              reserved={
                <div aria-hidden="true" className="aspect-[237/174] w-48 sm:w-64 md:w-72" />
              }
              render={(photo) =>
                photo ? (
                  <Photo
                    photo={photo}
                    alt={t("home.brandLogoAlt")}
                    sizes={BADGE_SIZES}
                    className={cn("h-auto rounded-lg", BADGE_FRAME)}
                  />
                ) : (
                  <BrandLogo className={BADGE_FRAME} />
                )
              }
            />
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
              <Highlighted text={tr(hero.title)} mark={hero.mark ? tr(hero.mark) : ""} />
            </h1>

            {/* One sentence with the practical facts somebody deciding
                whether to turn up needs: Saturday mornings, no experience
                needed. White here is 5.3:1 at its worst (top right at 390px,
                where the poster is pinkest); the gradient in styles.css runs
                the way it does to keep that above 4.5:1. */}
            {intro !== "" ? (
              <div data-confetti-avoid className="mt-related max-w-text text-lg">
                <p className="whitespace-pre-line">{intro}</p>
              </div>
            ) : null}

            {/* What a visitor most often comes to do: join and see the
                agenda as shipped, and whatever the band has put there since. */}
            <HeroActions actions={hero.actions ?? []} />
          </div>
        </div>
        <Scallop into="var(--color-ground)" />
      </div>
      {editing ? (
        <HeroEditor blockKey="home.hero" open={editingHero} onClose={() => setEditingHero(false)} />
      ) : null}

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

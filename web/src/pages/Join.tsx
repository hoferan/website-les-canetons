import { Cake, Clock, type LucideIcon, MapPin, Music, Phone } from "lucide-react";
import { Link } from "react-router-dom";

import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { type TranslationKey, t } from "../i18n";

/**
 * The information blocks. Keys rather than strings, resolved at render time:
 * a module-level array is evaluated once at import, so translated strings in
 * it would be frozen in one language.
 */
const FACTS: {
  headingKey: TranslationKey;
  lineKeys: TranslationKey[];
  icon: LucideIcon;
  tint: string;
}[] = [
  {
    headingKey: "join.facts.instruments.heading",
    icon: Music,
    tint: "bg-pink",
    lineKeys: [
      "join.facts.instruments.trumpet",
      "join.facts.instruments.trombone",
      "join.facts.instruments.sousaphone",
      "join.facts.instruments.euphonium",
    ],
  },
  {
    headingKey: "join.facts.schedule.heading",
    icon: Clock,
    tint: "bg-cyan",
    lineKeys: ["join.facts.schedule.day", "join.facts.schedule.time"],
  },
  {
    headingKey: "join.facts.age.heading",
    icon: Cake,
    tint: "bg-lime",
    lineKeys: ["join.facts.age.range"],
  },
];

/**
 * The joining contacts are placeholders until the band supplies current names
 * and numbers (#106); they then land here as prose.
 *
 * No tel: link on a placeholder: a wrong number dials a stranger, while a
 * parent who sees a gap writes to the committee, the fallback offered below.
 *
 * Not generated from the roster: a member row carries no phone number, and
 * "who to ring about joining" is not a committee title.
 */
const JOINING_CONTACTS = 2;

/**
 * A place link, not a directions link: a place query lets Google route from
 * the visitor's own location if they ask for directions.
 */
const WERKHOF_MAP =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Association Werkhof, Planche-Inférieure 14, 1700 Fribourg");

/**
 * How to join: the page a parent or a curious child lands on.
 *
 * The only tutoiement on the public site: this heading addresses the child
 * directly, which is who it is for. The home page stays impersonal because
 * it is read by both.
 */
export function Join() {
  return (
    <>
      <PageHero title={t("join.heading")} mark={t("join.headingHighlight")} seed={5}>
        <p>{t("join.intro")}</p>
      </PageHero>

      <PageSection>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map((fact) => (
            <Card key={fact.headingKey} className={cn(RAISED_CARD, "gap-0 p-5")}>
              <FactHeading icon={fact.icon} tint={fact.tint}>
                {t(fact.headingKey)}
              </FactHeading>
              {fact.lineKeys.map((lineKey) => (
                <p key={lineKey} className="mt-tight">
                  {t(lineKey)}
                </p>
              ))}
            </Card>
          ))}

          <Card className={cn(RAISED_CARD, "gap-0 p-5")}>
            <FactHeading icon={MapPin} tint="bg-yellow">
              {t("join.location")}
            </FactHeading>
            <p className="mt-tight">
              <a
                href={WERKHOF_MAP}
                target="_blank"
                rel="noreferrer"
                className="text-violet hover:underline"
              >
                Werkhof
              </a>
            </p>
            <p>{t("join.locationArea")}</p>
          </Card>

          <Card className={cn(RAISED_CARD, "gap-0 p-5")}>
            <FactHeading icon={Phone} tint="bg-lilac">
              {t("join.contacts")}
            </FactHeading>
            {Array.from({ length: JOINING_CONTACTS }, (_, index) => (
              <p key={index} className="mt-tight">
                <Tbd what={t("placeholders.joinContact")} token="join-contact" />
              </p>
            ))}
            <p className="mt-related text-sm text-ink-muted">
              {t("join.contactMeanwhile")}{" "}
              <Link to="/contact" className="text-violet underline">
                {t("join.contactPageLink")}
              </Link>
              .
            </p>
          </Card>
        </div>
      </PageSection>
    </>
  );
}

/**
 * A fact card's heading, with a picture of what it is about on a carnival
 * colour. The icon is decoration: the heading already says it.
 */
function FactHeading({
  icon: Icon,
  tint,
  children,
}: {
  icon: LucideIcon;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-xl border-3 border-ink ${tint}`}
      >
        <Icon aria-hidden="true" className="size-6" strokeWidth={2.25} />
      </span>
      <h2 className="font-display text-xl">{children}</h2>
    </div>
  );
}

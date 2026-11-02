import { Cake, Clock, type LucideIcon, MapPin, Music, Phone } from "lucide-react";
import { Link } from "react-router-dom";

import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { type TranslationKey, t } from "../i18n";
import { useEditMode } from "../texts/EditMode";
import { EditableText } from "../texts/EditableText";

/**
 * The information blocks. Keys rather than strings, resolved at render time:
 * a module-level array is evaluated once at import, so translated strings in
 * it would be frozen in one language. Each is a text the band can change on
 * the page; the instruments are one list, a line per instrument, so the band
 * can add or drop one.
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
    lineKeys: ["join.facts.instruments.list"],
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
 * How many placeholders stand in for the joining contacts until the band
 * stores them from the page (#106), one per person the old page listed.
 *
 * No guessed number: a wrong one dials a stranger, while a parent who sees a
 * gap writes to the committee, the fallback offered below. Not generated from
 * the roster either: a member row carries no phone number, and "who to ring
 * about joining" is not a committee title.
 */
const JOINING_CONTACTS = 2;

/**
 * A place link, not a directions link: a place query lets Google route from
 * the visitor's own location if they ask for directions. Built from the two
 * texts the band can change, so a move updates the map too.
 */
function mapLink(): string {
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(`${t("join.locationPlace")}, ${t("join.locationAddress")}`)
  );
}

/**
 * How to join: the page a parent or a curious child lands on.
 *
 * The only tutoiement on the public site: this heading addresses the child
 * directly, which is who it is for. The home page stays impersonal because
 * it is read by both.
 */
export function Join() {
  const editMode = useEditMode();

  return (
    <>
      <PageHero
        title={t("join.heading")}
        titleKey="join.heading"
        mark={t("join.headingHighlight")}
        seed={5}
      >
        <EditableText k="join.intro" as="p" />
      </PageHero>

      <PageSection>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FACTS.map((fact) => (
            <Card key={fact.headingKey} className={cn(RAISED_CARD, "gap-0 p-5")}>
              <FactHeading icon={fact.icon} tint={fact.tint}>
                <EditableText k={fact.headingKey} />
              </FactHeading>
              {fact.lineKeys.map((lineKey) => (
                <EditableText key={lineKey} k={lineKey} as="p" className="mt-tight" multiline />
              ))}
            </Card>
          ))}

          <Card className={cn(RAISED_CARD, "gap-0 p-5")}>
            <FactHeading icon={MapPin} tint="bg-yellow">
              <EditableText k="join.location" />
            </FactHeading>
            <EditableText k="join.locationPlace" as="p" className="mt-tight" neutral>
              {(place) => (
                <a
                  href={mapLink()}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet hover:underline"
                >
                  {place}
                </a>
              )}
            </EditableText>
            {/* Visitors get the map link; the street address it searches for
                shows only to an editor, who may need to change it. */}
            {editMode.on ? (
              <EditableText
                k="join.locationAddress"
                as="p"
                className="text-sm text-ink-muted"
                neutral
                label={t("join.locationAddressLabel")}
              />
            ) : null}
            <EditableText k="join.locationArea" as="p" />
          </Card>

          <Card className={cn(RAISED_CARD, "gap-0 p-5")}>
            <FactHeading icon={Phone} tint="bg-lilac">
              <EditableText k="join.contacts" />
            </FactHeading>
            <EditableText
              k="join.contactsList"
              as="p"
              className="mt-tight"
              multiline
              neutral
              phones
              label={t("join.contacts")}
              empty={Array.from({ length: JOINING_CONTACTS }, (_, index) => (
                <span key={index} className="block">
                  <Tbd what={t("placeholders.joinContact")} token="join-contact" />
                </span>
              ))}
            />
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

import { PageSection } from "@/components/PageSection";
import { RegisterIndex } from "@/components/RegisterIndex";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useBandIndex } from "../api/generated/endpoints";
import type { PublicSectionResource } from "../api/generated/model";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { registerSlot } from "../images/photoSlots";
import { SlotPhoto } from "../images/SlotPhoto";
import { registerName, t } from "../i18n";

/**
 * The anchor a jump link points at. Built from the register's ID, because a
 * name is typed content and a fragment made from it would change with every
 * typo fix.
 */
function anchorOf(register: PublicSectionResource): string {
  return `register-${register.id}`;
}

/** One register: its heading, its photograph slot, and who is in it. */
function Register({ register }: { register: PublicSectionResource }) {
  return (
    // scroll-mt keeps a jumped-to heading off the viewport edge; the header
    // is not sticky, so this is not an offset for it.
    // aria-labelledby names each of the near-identical blocks for a screen
    // reader, and lets a test scope an assertion to one register.
    <article
      id={anchorOf(register)}
      aria-labelledby={`${anchorOf(register)}-heading`}
      className="scroll-mt-6"
    >
      <h2 id={`${anchorOf(register)}-heading`} className="heading-wave w-fit font-display text-2xl">
        {registerName(register.name, register.nameDe)}
      </h2>
      {/* The library lists the slot under the French name, as the band
          types it; what a visitor reads is the page's own. */}
      <SlotPhoto
        slot={registerSlot(register.id)}
        label={register.name}
        alt={registerName(register.name, register.nameDe)}
      />

      <p className="mt-tight text-ink-muted">
        {register.members.length > 0 ? (
          register.members.map((member) => member.firstName).join(", ")
        ) : (
          <Tbd what={t("placeholders.registerFirstNames")} token="register-first-names" />
        )}
      </p>

      {register.instructors.length > 0 ? (
        <p className="mt-tight text-sm text-ink-muted">
          {t("band.instructors")}{" "}
          {register.instructors.map((instructor) => instructor.firstName).join(", ")}
        </p>
      ) : null}
    </article>
  );
}

/**
 * The band, register by register, generated from the roster.
 *
 * First names only: these are children, and a parent checks this page for
 * their own child. The API also sends the surname, because the committee page
 * needs it and one public member shape is easier to keep honest than two.
 *
 * An empty register still gets its heading, with the gap written out by
 * `<Tbd />`. Consent is opt-in and defaults to off; hiding empty registers
 * would say the band has no drummers, and would let a reader infer that a
 * particular child said no.
 *
 * The direction musicale is not a register. Leading the band is a role, roles
 * are not public, and whoever holds it appears on /committee.
 */
export function Band() {
  const band = useBandIndex();
  const registers = rowsOf<PublicSectionResource>(band.data);

  return (
    <>
      <PageHero title={t("band.heading")} mark={t("band.headingHighlight")} seed={7} width="text" />

      <PageSection width="text">
        <SlotPhoto slot="band" label={t("photos.slot.band")} alt="Les Canetons de Fribourg" />

        <RegisterIndex
          entries={registers.map((register) => ({
            id: anchorOf(register),
            label: registerName(register.name, register.nameDe),
          }))}
        />

        <div className="mt-block space-y-block">
          {registers.map((register) => (
            <Register key={register.id} register={register} />
          ))}
        </div>

        {/* Set apart from the registers: a parrain and a marraine do not
            play, and listing them among the registers implies they do.

            Authored copy, the one thing on this page that is. `members` is
            the roster, and every row in it has an account and answers
            events, so there is no row for them.

            Held until the roster has answered, whatever the answer: the
            registers are far taller than a screen, and a card rendered while
            they load gets pushed out of view when they arrive (#236). */}
        {band.isPending ? null : (
          <>
            <hr className="mt-section border-line" />

            <Card className={cn(RAISED_CARD, "mt-block gap-0 p-5")}>
              <h2 className="font-display text-2xl">{t("band.patronsHeading")}</h2>
              <SlotPhoto
                slot="godparents"
                label={t("photos.slot.godparents")}
                alt={t("band.patronsAlt")}
              />
              <p className="mt-tight text-ink-muted">{t("band.patrons")}</p>
            </Card>
          </>
        )}
      </PageSection>
    </>
  );
}

import { PageSection } from "@/components/PageSection";
import { PhotoReserved } from "@/components/PhotoPending";
import { RegisterIndex } from "@/components/RegisterIndex";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";

import { rowsOf } from "../api/collection";
import { useBandIndex, useSitePhotoIndex } from "../api/generated/endpoints";
import type { PublicSectionResource } from "../api/generated/model";
import { SlotPhoto } from "../images/SlotPhoto";
import { t } from "../i18n";

/**
 * The anchor a jump link points at.
 *
 * Built from the register's ID rather than from its name, because a name is
 * content the committee may type in any language with any punctuation, and a
 * fragment made out of one would change the moment somebody fixed a typo.
 * CLAUDE.md puts identifiers and slugs in English; this one is a number, which
 * is in no language at all.
 */
function anchorOf(register: PublicSectionResource): string {
  return `register-${register.id}`;
}

/** One register: its heading, its photograph slot, and who is in it. */
function Register({ register }: { register: PublicSectionResource }) {
  return (
    // scroll-mt so a jumped-to heading is not flush against the top of the
    // viewport. NOT an offset for a sticky header — this site's header scrolls
    // away with the page.
    // aria-labelledby, so each register is a NAMED region: the page is six
    // near-identical blocks, and without a name they are six anonymous
    // articles a screen-reader user has to read into before knowing which is
    // which. It is also what lets a test scope an assertion to one register
    // rather than to the whole page.
    <article
      id={anchorOf(register)}
      aria-labelledby={`${anchorOf(register)}-heading`}
      className="scroll-mt-6"
    >
      <h2 id={`${anchorOf(register)}-heading`} className="font-display text-2xl">
        {register.name}
      </h2>
      <SlotPhoto
        slot={{ kind: "register", sectionId: register.id, name: register.name }}
        photo={register.photo}
        alt={register.name}
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
 * The band, register by register — generated from the roster rather than
 * authored, which is why this page had to wait for the roster to exist.
 *
 * FIRST NAMES ONLY. The API sends both halves and this page renders one,
 * deliberately: these are children, the page is the one a parent checks for
 * their own child, and a first name is what the legacy page published. The
 * surname stays in the response because the committee page needs it and
 * because one public member shape is easier to keep honest than two.
 *
 * AN EMPTY REGISTER STILL GETS ITS HEADING, and the gap is written out with
 * `<Tbd />`. Consent is opt-in and defaults to off, so today every register is
 * empty and the page is a list of six placeholders — which is exactly what it
 * should look like until the band enters the roster and forty-five people have
 * each said yes or no. Hiding the empty ones would say the band has no
 * drummers, and it would let a reader infer that a particular child said no.
 *
 * The direction musicale is NOT a register here, unlike on the legacy page.
 * Leading the band is a role now, and roles are not public; whoever holds it
 * appears on /committee under the title the committee gives them.
 */
export function Band() {
  const band = useBandIndex();
  const registers = rowsOf<PublicSectionResource>(band.data);
  const sitePhotos = useSitePhotoIndex();
  const bandPhoto = sitePhotos.data?.status === 200 ? sitePhotos.data.data.band : null;

  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">{t("band.heading")}</h1>
      {/* The same frame, without its caption, while the answer is on its way:
          the placeholder text would flash and then give way to the photo, and
          rendering nothing would push the register index down when it
          arrives. */}
      {sitePhotos.isPending ? (
        <PhotoReserved />
      ) : (
        <SlotPhoto slot={{ kind: "band" }} photo={bandPhoto} alt="Les Canetons de Fribourg" />
      )}

      <RegisterIndex
        entries={registers.map((register) => ({
          id: anchorOf(register),
          label: register.name,
        }))}
      />

      <div className="mt-block space-y-block">
        {registers.map((register) => (
          <Register key={register.id} register={register} />
        ))}
      </div>

      {/* SET APART FROM THE REGISTERS ON PURPOSE.
          Moved here from the old committee page on 2026-08-31, then separated
          from the register list the same day: the band pointed out that a
          parrain and a marraine are not an active part of the Canetons.
          Listing them in the same flow as the batteurs and the trompettes
          implies they play, which they do not.

          IT IS AUTHORED, NOT GENERATED, and it is the one thing on this page
          that is. These two are people the band DISPLAYS rather than tracks
          for events, so there is no row for them: `members` is the roster, and
          every row in it has an account and answers for events. Whether that
          kind of person ever earns a table of their own is a question for
          whenever the band supplies a name the roster cannot hold.

          Their photograph is the ORIGINAL, not a placeholder. Every other
          photo went on the assumption it was out of date, but that reasoning
          is about a roster that turns over yearly; two people who are not in
          the band do not go stale the same way, and the band asked for the old
          image back. */}
      <hr className="mt-section border-line" />

      <Card className="mt-block gap-0 p-5">
        <h2 className="font-display text-2xl">{t("band.patronsHeading")}</h2>
        <img
          src="/assets/img/parrainmarraine.jpg"
          alt={t("band.patronsAlt")}
          loading="lazy"
          className="mt-related rounded-lg"
        />
        <p className="mt-tight text-ink-muted">{t("band.patrons")}</p>
      </Card>
    </PageSection>
  );
}

import { PageSection } from "@/components/PageSection";
import { PhotoPending } from "@/components/PhotoPending";
import { RegisterIndex } from "@/components/RegisterIndex";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";

import { rowsOf } from "../api/collection";
import { useBandIndex } from "../api/generated/endpoints";
import type { PublicSectionResource } from "../api/generated/model";

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
      {/* "du registre X", not "des x". A REGISTER'S NAME IS CONTENT THE
          COMMITTEE TYPED, so no article can be inferred from it: the legacy
          page hardcoded one per register ("des batteurs", "de la lyre") and a
          generated `des ${name}` writes "Nouvelle photo des lyre", which is
          wrong French today and would be wrong differently for whatever the
          committee adds next. Naming the register after a fixed noun is
          grammatical for every possible name. */}
      <PhotoPending what={`du registre ${register.name}`} />

      <p className="mt-tight text-ink-muted">
        {register.members.length > 0 ? (
          register.members.map((member) => member.firstName).join(", ")
        ) : (
          <Tbd what="prénoms du registre" />
        )}
      </p>

      {register.instructors.length > 0 ? (
        <p className="mt-tight text-sm text-ink-muted">
          Moniteurs&nbsp;:{" "}
          {register.instructors.map((instructor) => instructor.firstName).join(", ")}
        </p>
      ) : null}
    </article>
  );
}

/**
 * The band, register by register — generated from the roster rather than
 * authored, which is what R2 was waiting for R1's roster to exist.
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

  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Nos Canetons</h1>
      <PhotoPending what="des Canetons au complet" />

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
        <h2 className="font-display text-2xl">Le parrain et la marraine</h2>
        <img
          src="/assets/img/parrainmarraine.jpg"
          alt="Le parrain et la marraine des Canetons"
          loading="lazy"
          className="mt-related rounded-lg"
        />
        <p className="mt-tight text-ink-muted">Richard Hertig et Annick Bürgisser</p>
      </Card>
    </PageSection>
  );
}

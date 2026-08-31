import { Tbd } from "../components/Tbd";

/** The information blocks, in the old page's order. */
const FACTS: { heading: string; lines: string[] }[] = [
  {
    heading: "Instruments recherchés",
    lines: ["Trompette", "Trombone", "Sousaphone", "Euphonium"],
  },
  { heading: "Horaires", lines: ["Les samedis matin", "De 10h à 12h"] },
  { heading: "Critères d’âge", lines: ["Dès 7 ans dans l’année civile jusqu’à l’âge de 18 ans"] },
];

/**
 * THE JOINING CONTACTS ARE PLACEHOLDERS ON PURPOSE.
 *
 * The old page published two names with mobile numbers. Both were the pair that
 * /historique says have handed the direction musicale over, and when the content
 * audit asked whether the numbers were still right the answer was that since the
 * direction changed "the phone numbers might be out of date as well — just
 * replace them with placeholders".
 *
 * There is deliberately NO tel: link on a placeholder. A clickable number that
 * is wrong dials a stranger; a parent who sees a gap writes to the committee
 * instead, which is the fallback offered below.
 */
const JOINING_CONTACTS = 2;

/**
 * A PLACE link, not a directions link.
 *
 * This used to be a maps/dir/ URL whose origin was a hardcoded coordinate pair
 * west of Fribourg, so every parent who clicked "Werkhof" was routed from a spot
 * that had nothing to do with where they were. Found by the 2026-08-31 content
 * audit. A place query lets Google use the visitor's own location if they ask
 * for directions from here.
 */
const WERKHOF_MAP =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Association Werkhof, Planche-Inférieure 14, 1700 Fribourg");

export function Commencement() {
  return (
    <section className="printable mx-auto max-w-5xl px-4 py-8">
      {/* Print only. The nav and footer are hidden on paper (see styles.css), so
          the sheet needs to say who it is from. */}
      <p className="hidden text-sm font-semibold tracking-widest text-violet uppercase print:block">
        Guggenmusik Les Canetons de Fribourg &middot; www.lescanetons.org
      </p>

      <h1 className="font-display text-4xl">Tu veux commencer la guggen&nbsp;?</h1>
      <p className="mt-4 max-w-prose">
        Nous sommes constamment à la recherche de quelques souffleurs pour s’époumonner et faire
        &laquo;&nbsp;concurrence&nbsp;&raquo; à nos percussions&nbsp;!
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FACTS.map((fact) => (
          <div key={fact.heading} className="rounded-lg border border-line bg-panel p-5">
            <h2 className="font-display text-xl">{fact.heading}</h2>
            {fact.lines.map((line) => (
              <p key={line} className="mt-1">
                {line}
              </p>
            ))}
          </div>
        ))}

        <div className="rounded-lg border border-line bg-panel p-5">
          <h2 className="font-display text-xl">Lieu</h2>
          <p className="mt-1">
            <a
              href={WERKHOF_MAP}
              target="_blank"
              rel="noreferrer"
              className="text-violet hover:underline"
            >
              Werkhof
            </a>
          </p>
          <p>Basse-Ville de Fribourg</p>
        </div>

        <div className="rounded-lg border border-line bg-panel p-5">
          <h2 className="font-display text-xl">Contacts</h2>
          {Array.from({ length: JOINING_CONTACTS }, (_, i) => (
            <p key={i} className="mt-1">
              <Tbd what="nom et numéro" />
            </p>
          ))}
          <p className="mt-3 text-sm text-ink-muted">
            En attendant, écrivez-nous à{" "}
            <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
              comite@lescanetons.org
            </a>
            .
          </p>
        </div>
      </div>

      {/* THE FLYER IS THE PAGE, PRINTED.
          Flyer.jpeg used to be shown here and offered as a download; the
          2026-08-31 content audit's answer was to replace it with a CSS one
          "because the information in the Flyer is outdated anyway".

          The first attempt built a separate flyer panel below these cards — and
          it repeated all four of them verbatim, which is exactly the redundancy
          this sub-project exists to remove. So there is no flyer panel: the print
          rules in styles.css hide the header, nav, footer and this button, and
          what remains on the sheet IS the flyer. It can never drift from the
          page, because it is the page. */}
      <button
        type="button"
        onClick={() => window.print()}
        className="mt-8 inline-block rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 print:hidden"
      >
        Imprimer le flyer
      </button>
    </section>
  );
}

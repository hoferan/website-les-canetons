/** The four information blocks, in the old page's order. */
const FACTS: { heading: string; lines: string[] }[] = [
  {
    heading: "Instruments recherchés",
    lines: ["Trompette", "Trombone", "Sousaphone", "Euphonium"],
  },
  { heading: "Horaires", lines: ["Les samedis matin", "De 10h à 12h"] },
  { heading: "Critères d’âge", lines: ["Dès 7 ans dans l’année civile jusqu’à l’âge de 18 ans"] },
];

/** Published so a parent can call about joining. Ported verbatim. */
const CONTACTS: { name: string; phone: string; tel: string }[] = [
  { name: "Delphine Maillard", phone: "075 417 71 91", tel: "tel:0754177191" },
  { name: "Laura Mantel", phone: "079 280 77 67", tel: "tel:0792807767" },
];

const WERKHOF_MAP =
  "https://www.google.com/maps/dir/46.8067938,7.1370156/Association+Werkhof+Fribourg,+Planche-Inférieure+14,+1700+Fribourg/@46.8124723,7.1349983,14z/data=!3m1!4b1!4m9!4m8!1m1!4e1!1m5!1m1!1s0x478e69237f5723e3:0x97fe5bd05ee01349!2m2!1d7.1656142!2d46.8025755?hl=fr&entry=ttu";

export function Commencement() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
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
          {CONTACTS.map((contact) => (
            <p key={contact.tel} className="mt-1">
              {contact.name} —{" "}
              <a href={contact.tel} className="text-violet hover:underline">
                {contact.phone}
              </a>
            </p>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <img
          src="/assets/img/Flyer.jpeg"
          alt="Le flyer de recrutement des Canetons"
          loading="lazy"
          className="rounded-lg"
        />
        {/* An <a download>, not a button wrapping one as the old page had: a
            button inside a link is invalid markup and confuses assistive
            technology about what the control does. */}
        <a
          href="/assets/img/Flyer.jpeg"
          download
          className="mt-4 inline-block rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90"
        >
          Télécharger le flyer
        </a>
      </div>
    </section>
  );
}

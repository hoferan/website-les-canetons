/** Three groups of outbound links, in the order the old page listed them. */
const GROUPS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Les Carnavals",
    links: [
      { href: "http://www.carnavaldesbolzes.ch/", label: "Carnaval des Bolzes - Fribourg" },
      { href: "http://www.carnavalestavayer.ch/", label: "Carnaval d’Estavayer" },
      { href: "http://www.carnavalromont.ch/", label: "Carnaval de Romont" },
      {
        href: "http://www.carnatchaux.ch/",
        label: "Carna’Tchaux : Carnaval de la Chaux de Fonds",
      },
      { href: "http://www.brandonspayerne.ch/", label: "Les Brandons de Payerne" },
    ],
  },
  {
    heading: "Les Guggens",
    links: [
      { href: "http://www.3canards.ch/portal/index.php", label: "Les 3 Canards - Fribourg" },
      { href: "http://www.lesgouillesagasses.com/", label: "Les Gouilles Agasses - Le Mouret" },
      { href: "http://www.lesendiables.ch/", label: "Les Endiablés - Courtepin" },
      { href: "http://www.lestricounis.ch/", label: "Les Tricounis - Belfaux" },
      { href: "http://www.ladecaps.com/", label: "La Décapsuleuse - Romont" },
    ],
  },
  {
    heading: "Les Amis",
    links: [
      { href: "http://www.collaud-criblet.ch/home.php", label: "Collaud & Criblet - Publicité" },
      { href: "http://www.13carnavaleux.com/", label: "Les 13 Carnavaleux" },
    ],
  },
];

/**
 * The URLs are http:// because that is what the old page had and what these
 * sites answer on. Upgrading them here would be guessing on twelve third-party
 * hosts we do not control; a broken link is worse than an unencrypted one to a
 * public carnival homepage.
 */
export function Sponsors() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      {/* "Liens Amis" title-cased, which is unusual in French and is what the
          old page had. The NAV label beside it is lowercase; both are
          reproduced as they are rather than reconciled. */}
      <h1 className="font-display text-4xl">Sponsors et Liens Amis</h1>

      <div className="mt-6 space-y-6">
        {GROUPS.map((group) => (
          <div key={group.heading} className="rounded-lg border border-line bg-panel p-5">
            <h2 className="font-display text-xl">{group.heading}</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {group.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-violet hover:underline"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

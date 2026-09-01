import { PageSection } from "@/components/PageSection";

/**
 * Three groups of outbound links, in the order the old page listed them.
 *
 * ALL URLS ARE https:// AS OF 2026-08-31, and that is a measurement rather than
 * an assumption. This file used to carry the opposite advice — that upgrading
 * "would be guessing on twelve third-party hosts we do not control" — which was
 * fair when nobody had checked. The content audit checked: every host that still
 * answers serves HTTPS, and six of them already redirected http -> https
 * themselves.
 *
 * Three links were REMOVED because the sites are gone, not merely moved:
 *
 *   carnatchaux.ch    answers HTTP 200 with the title "Domain For Sale" -- the
 *                     domain is squatted. A link checker that only reads status
 *                     codes passes it, which is why it survived this long.
 *   lestricounis.ch   DNS no longer resolves. lestricounis.com is a broken Wix
 *                     "ConnectYourDomain" page, so there is no successor to
 *                     point at.
 *   13carnavaleux.com DNS no longer resolves, no successor found.
 *
 * Two were 404s whose sites are alive at a different path, so they were FIXED
 * rather than dropped: Les 3 Canards lost its /portal/index.php, and Collaud &
 * Criblet its /home.php.
 *
 * If a removed band turns out to still exist somewhere, add it back — the audit
 * could only prove the old address is dead, not that the band is.
 */
const GROUPS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Les Carnavals",
    links: [
      { href: "https://www.carnavaldesbolzes.ch/", label: "Carnaval des Bolzes - Fribourg" },
      { href: "https://www.carnavalestavayer.ch/", label: "Carnaval d’Estavayer" },
      { href: "https://www.carnavalromont.ch/", label: "Carnaval de Romont" },
      { href: "https://www.brandonspayerne.ch/", label: "Les Brandons de Payerne" },
    ],
  },
  {
    heading: "Les Guggens",
    links: [
      { href: "https://3canards.ch/", label: "Les 3 Canards - Fribourg" },
      { href: "https://lesgouillesagasses.com/", label: "Les Gouilles Agasses - Le Mouret" },
      { href: "https://lesendiables.ch/", label: "Les Endiablés - Courtepin" },
      { href: "https://ladecaps.com/", label: "La Décapsuleuse - Romont" },
    ],
  },
  {
    heading: "Les Amis",
    links: [{ href: "https://www.collaud-criblet.ch/", label: "Collaud & Criblet - Publicité" }],
  },
];

export function Sponsors() {
  return (
    <PageSection width="text">
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
    </PageSection>
  );
}

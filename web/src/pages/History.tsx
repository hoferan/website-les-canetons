import { PageSection } from "@/components/PageSection";

/**
 * The band's history — the one page on the site that is pure authored prose.
 *
 * PORTED VERBATIM from the pre-rebuild page, which itself ported the legacy
 * `historique.php` word for word. Nothing factual here is invented, and
 * nothing is tidied: the shouted opening paragraph is the band's own, and the
 * accents missing from it ("CREEE", "DEBUTANT") are how the source set caps.
 *
 * It contradicted the old committee page, which still listed Laura Mantel and
 * Delphine Maillard as the direction musicale while this page says they handed
 * over to Lilou Keller and Anaïs Meuwly. THAT CONTRADICTION IS NOW STRUCTURAL
 * RATHER THAN EDITORIAL: /committee is generated from the roster, so whoever
 * the committee enters as holding the title is who the site publishes, and
 * only this page still carries the names as prose. If the two disagree again,
 * the roster is right and this paragraph is stale.
 *
 * The last paragraph is the only one that dates: it describes a handover as
 * recent. It will need rewriting by the band eventually, which is a content
 * question rather than a reason to hold the page back — the alternative is the
 * URL 404ing, which is what it does today.
 */
export function History() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">L’Histoire des Canetons</h1>

      <div className="mt-block max-w-prose space-y-related">
        <p className="font-semibold">
          LA GUGGEN D’ENFANTS &laquo;&nbsp;LES CANETONS&nbsp;&raquo; DE FRIBOURG S’EST
          OFFICIELLEMENT CREEE EN OCTOBRE 2002. DEBUTANT AVEC UNE DIZAINE DE MUSICIENS… CETTE JEUNE
          GUGGEN S’EST VITE RETROUVEE AVEC UNE QUARANTAINE D’ENFANTS.
        </p>
        <p>
          En remarquant l’engouement de plusieurs gamins qui suivaient les &laquo;&nbsp;3
          Canards&nbsp;&raquo; et qui rêvaient de mettre de l’ambiance comme eux, il n’en fallut pas
          plus pour que Jacky Schaller accepte de prendre la direction de ces petits hyper
          motivés&nbsp;!
        </p>
        <p>
          Débutant avec une dizaine de musiciens, sans vraiment recruter, jouant uniquement la carte
          du &laquo;&nbsp;bouche à oreilles&nbsp;&raquo;, cette jeune guggen s’est vite retrouvée
          avec une quarantaine d’enfants, âgés de 7 à 18 ans. Pas besoin de connaître la musique
          pour s’intégrer au groupe... Des moniteurs apprennent les morceaux aux jeunes, registre
          par registre, lors des répétitions qui ont lieu, en général, le samedi matin.
        </p>
        <p>
          Dès la saison 2007/2008, les Directeurs (tous d’anciens Canetons) se sont succédé. Tout
          d’abord Anthony Cotting, puis Delphine Brügger et Fabio Portmann.
        </p>
        <p>
          Depuis 2019, les Canetons ont été dirigés par Delphine Maillard et Laura Mantel. Après
          sept années d’un engagement remarquable, elles passent à présent le flambeau à deux jeunes
          musiciennes, Lilou Keller et Anaïs Meuwly. Toutes deux débordent d’énergie et de
          motivation, prêtes à poursuivre l’aventure et à insuffler un nouvel élan à cette
          merveilleuse Guggen.
        </p>
      </div>
    </PageSection>
  );
}

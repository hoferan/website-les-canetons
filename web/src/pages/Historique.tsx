import { PageSection } from "@/components/PageSection";

/**
 * The band's history, ported verbatim from historique.php.
 *
 * Note this page says the direction passed to Lilou Keller and Anaïs Meuwly,
 * while comite_teamdirection.tsx still lists Laura Mantel and Delphine Maillard
 * as the direction musicale. The live site contradicts itself; the port
 * reproduces both, because which one is current is a content question for the
 * band rather than something to settle inside a refactor. Recorded as an open
 * question in docs/continue-here.md.
 */
export function Historique() {
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

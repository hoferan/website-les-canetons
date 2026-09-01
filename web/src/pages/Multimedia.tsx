import { PageSection } from "@/components/PageSection";

export function Multimedia() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">France 3 Alsace / Carnaval de Colmar 2016</h1>

      {/* https, not the old protocol-relative //embed.francetv.fr — the site is
          HTTPS-only and that form is a relic of serving both schemes.

          aspect-video plus an absolutely positioned iframe, rather than the old
          fixed 560x315: at 390px wide a fixed-width iframe overflows the page
          and scrolls the whole body sideways. */}
      <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-lg bg-stage">
        <iframe
          src="https://embed.francetv.fr/cca9a2de4ec3e5e4c5a2ca96470d500c"
          title="Carnaval de Colmar 2016 — reportage France 3 Alsace"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>

      <p className="mt-4">
        <a
          href="https://france3-regions.francetvinfo.fr/grand-est/haut-rhin/colmar/colmar-une-cavalcade-rien-que-pour-les-enfants-933067.html"
          target="_blank"
          rel="noreferrer"
          className="text-violet hover:underline"
        >
          Colmar&nbsp;: une cavalcade rien que pour les enfants
        </a>
      </p>
    </PageSection>
  );
}

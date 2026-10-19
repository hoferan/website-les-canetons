import { ButtonLink } from "@/components/ButtonLink";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { Confetti } from "../carnival/Confetti";
import { useFooterEdge } from "../carnival/footerEdge";
import { POSTER_CONFETTI } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { Scallop } from "../carnival/Scallop";
import { t } from "../i18n";

/**
 * A soft 404: the server answers 200 with the shell, because the .htaccess
 * fallback is a catch-all by design (see config/htaccess/site.htaccess).
 * Answering 404 would mean enumerating every route in .htaccess, where the
 * list would drift from the router.
 *
 * The whole page is poster, with three times the usual confetti: it has the
 * least to read, so it can carry the most decoration (ADR 0029). The words sit
 * on a white card, which keeps ink-on-white contrast wherever it lands.
 *
 * The poster fills `main`, which is at least a screen tall, so no band of
 * cream is left above the footer. The edge it hands the footer is the stage,
 * the colour its own Scallop paints along the bottom.
 */
export function NotFound() {
  useFooterEdge("var(--color-stage)");

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-poster">
      <Confetti seed={31} colours={POSTER_CONFETTI} density={3} wobble />
      {/* `pb-20` and up leave the Scallop its 22px over the bottom edge. */}
      <div className="relative mx-auto flex max-w-text flex-col items-center px-4 pt-10 pb-20 text-center md:pt-16 md:pb-28">
        {/* Decoration: the heading says the same in words. Yellow on the
            poster measures 3.25:1 at its weakest, the top right of the digits
            at 390px, over the 3:1 that text this size needs. */}
        <p
          aria-hidden="true"
          data-confetti-avoid
          className="-rotate-3 font-display text-8xl text-yellow [text-shadow:5px_5px_0_var(--color-ink)] md:text-9xl"
        >
          404
        </p>

        <Card
          data-confetti-avoid
          className={cn(RAISED_CARD, "mt-block w-full max-w-md items-center gap-0 p-6")}
        >
          <h1 className="font-display text-3xl">{t("notFound.heading")}</h1>
          <p className="mt-related text-ink-muted">{t("notFound.body")}</p>
          {/* A ButtonLink rather than a text link: the page's only control
              belongs above the 44px floor. Inline links in prose are a
              different case. */}
          <ButtonLink to="/" variant="raised" className="mt-block h-12 px-5 text-base">
            {t("common.backHome")}
          </ButtonLink>
        </Card>
      </div>
      <Scallop into="var(--color-stage)" />
    </div>
  );
}

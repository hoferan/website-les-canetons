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
 * A SOFT 404: the server answered 200 with the shell, because the .htaccess
 * fallback is a catch-all by design (see config/htaccess/site.htaccess), and
 * this is what the visitor sees. Same visible page as before the cutover,
 * different HTTP status — accepted deliberately, since the alternative is
 * enumerating every route in .htaccess where it would drift from the router.
 *
 * THE WHOLE PAGE IS POSTER, with three times the usual confetti. It has the
 * least to read of any page, so it can carry the most decoration (ADR 0029).
 * The words sit on a white card rather than on the gradient, which keeps them
 * at ink-on-white contrast wherever the card lands on the poster.
 *
 * The poster fills `main`, which is at least a screen tall, and its bumps hang
 * straight into the footer. Without that, a page this short left a band of
 * cream between the two. The edge it hands the footer is the stage, because
 * that is the colour its own Scallop paints along the bottom.
 */
export function NotFound() {
  useFooterEdge("var(--color-stage)");

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-poster">
      <Confetti seed={31} colours={POSTER_CONFETTI} density={3} />
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
          {/* A ButtonLink rather than an underlined text link: this is the
              page's only way out and the one control on it, so it belongs
              above the 44px floor. It measured 24px. Inline links inside prose
              are a different case and stay as they are. */}
          <ButtonLink to="/" variant="raised" className="mt-block h-12 px-5 text-base">
            {t("common.backHome")}
          </ButtonLink>
        </Card>
      </div>
      <Scallop into="var(--color-stage)" />
    </div>
  );
}

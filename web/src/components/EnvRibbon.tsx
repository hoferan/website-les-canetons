import { type ReactNode } from "react";

/**
 * A colour per env, so a tester knows at a glance which site they are on
 * without reading a word. The carnival colours, with ink text like every
 * other surface in them (ADR 0029). Red stays for errors.
 */
const ENV_COLOUR: Record<string, string> = {
  dev: "bg-cyan",
  test: "bg-yellow",
  qa: "bg-lime",
  preview: "bg-pink",
};

/**
 * The non-prod ribbon: a band across the top right corner, and a strip of
 * the same colour along the top edge of the page.
 *
 * An unknown or missing env is treated as PROD, with no ribbon, so the live
 * site stays clean by default. The other default would put a ribbon on the
 * real site, which teaches everyone to ignore ribbons.
 *
 * "preview" is no server's env: only the mocked backend of a PR preview
 * answers it (#353), and the PR number is baked into that build alone. Its
 * label is English in both locales, like the env names, because only
 * developers and reviewers ever see a preview.
 */
export function EnvRibbon({ env }: { env: string }) {
  const colour = ENV_COLOUR[env];
  if (!colour) return null;

  let label: ReactNode = env.toUpperCase();
  if (env === "preview") {
    // "Preview" only where the band has room for it; see the sizes below.
    label = (
      <>
        <span className="hidden min-[380px]:inline md:hidden xl:inline">Preview </span>PR-
        {import.meta.env.VITE_PREVIEW_PR ?? "?"}
      </>
    );
  }

  return (
    <>
      {/* The strip: the colour across the whole width, where the corner is
          easy to miss on a wide screen. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-x-0 top-0 z-[35] h-1 ${colour}`}
      />
      <div
        aria-hidden="true"
        /* A square in the corner that clips the band, so neither end reaches
           past the viewport.

           The corner holds the end of the band's name on a phone and the
           language switch from md up, and the band must cover neither. How
           far it can sit from the corner, and so how long a label it can
           carry, was measured at each width:

             below 380px      the name runs nearly to the edge: close, "PR-n"
             380px to md      the phone header leaves room: "Preview PR-n"
             md to xl         the header spans the width and the switch sits
                              in the corner: close again, "PR-n"
             xl and up        the header is centred with a margin: the full
                              label, larger

           z-[35]: over the header (sticky at z-30 on a phone), under the
           phone menu (z-40). pointer-events none, so a click on whatever the
           band crosses still lands. */
        className="pointer-events-none fixed top-0 right-0 z-[35] size-[76px] overflow-hidden motion-safe:animate-ribbon-in xl:size-[132px]"
      >
        <div
          /* Its centre sits on the square's diagonal, the same distance from
             the top and the right edge, and it turns about that centre, so it
             crosses the corner at 45 degrees and leaves through the top and
             the right edge. Twice the square's size, so its ends never show.
             The raised ink shadow is the site's buttons'; the dashed outline
             inside the edge is the stitching of a sewn-on ribbon. */
          className={`absolute top-[17px] right-[17px] w-[152px] translate-x-1/2 -translate-y-1/2 rotate-45 ${colour} py-0.5 text-center font-display text-[8px] leading-tight tracking-wider text-ink uppercase shadow-raised-sm outline-1 -outline-offset-2 outline-ink/50 outline-dashed min-[380px]:top-[29px] min-[380px]:right-[29px] md:top-[21px] md:right-[21px] md:text-[10px] xl:top-[45px] xl:right-[45px] xl:w-[264px] xl:py-1.5 xl:text-xs xl:outline-2 xl:-outline-offset-4`}
        >
          {label}
        </div>
      </div>
    </>
  );
}

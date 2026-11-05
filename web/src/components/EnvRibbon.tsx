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
 * answers it (#353), and the PR number is baked into that build alone. It
 * reads "PR-n": a pull request is all a preview ever is, and the short
 * label can be large enough to read at a glance.
 */
export function EnvRibbon({ env }: { env: string }) {
  const colour = ENV_COLOUR[env];
  if (!colour) return null;

  const label =
    env === "preview" ? `PR-${import.meta.env.VITE_PREVIEW_PR ?? "?"}` : env.toUpperCase();

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
           language switch from md up, where the header spans the width, and
           the band must cover neither. So it sits close to the corner below
           xl, and closer and smaller still below 380px, where the name runs
           nearly to the edge. From xl the header is centred with a margin,
           and the band moves out and grows. All three were measured from 320
           to 1440px with a five-digit PR number, the longest label, so
           "PR-12345" still fits inside the band.

           z-[35]: over the header (sticky at z-30 on a phone), under the
           phone menu (z-40). pointer-events none, so a click on whatever the
           band crosses still lands. */
        className="pointer-events-none fixed top-0 right-0 z-[35] size-[76px] overflow-hidden motion-safe:animate-ribbon-in xl:size-[104px]"
      >
        <div
          /* Its centre sits on the square's diagonal, the same distance from
             the top and the right edge, and it turns about that centre, so it
             crosses the corner at 45 degrees and leaves through the top and
             the right edge. Twice the square's size, so its ends never show.
             The raised ink shadow is the site's buttons'; the dashed outline
             inside the edge is the stitching of a sewn-on ribbon. */
          className={`absolute top-[22px] right-[22px] max-[379px]:top-[16px] max-[379px]:right-[16px] max-[379px]:text-[8px] w-[152px] translate-x-1/2 -translate-y-1/2 rotate-45 ${colour} py-0.5 text-center font-display text-[11px] leading-tight text-ink uppercase shadow-raised-sm outline-1 -outline-offset-2 outline-ink/40 outline-dashed xl:top-[30px] xl:right-[30px] xl:w-[208px] xl:py-1.5 xl:text-base xl:outline-2 xl:-outline-offset-4`}
        >
          {label}
        </div>
      </div>
    </>
  );
}

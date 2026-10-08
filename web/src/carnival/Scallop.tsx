import { useId } from "react";

const BUMP_WIDTH = 40;
const BUMP_DEPTH = 22;

/**
 * The scalloped edge where a surface ends: round bumps of the surface hanging
 * down into whatever comes next (ADR 0029).
 *
 * It draws the NEXT colour, `into`, over the bottom of the surface it sits in,
 * leaving the bumps transparent. `into` is any CSS colour, `var()` included,
 * which is why it is set as a style rather than a `fill` attribute. That way the surface can be a gradient, as the
 * home page hero is, and the bumps still match it. The surface has to be
 * `relative` and leave BUMP_DEPTH of padding at its bottom.
 *
 * A pattern in pixels rather than one path stretched to the width, so a bump is
 * 40px at 390px and at 1280px alike. The stretched version squashed into a
 * zigzag on a phone.
 */
export function Scallop({ into }: { into: string }) {
  // React's ids carry punctuation that does not survive inside url(#…).
  const id = `scallop-${useId().replace(/[^\w-]/g, "")}`;
  const half = BUMP_WIDTH / 2;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-0 block w-full"
      height={BUMP_DEPTH}
    >
      <defs>
        <pattern id={id} width={BUMP_WIDTH} height={BUMP_DEPTH} patternUnits="userSpaceOnUse">
          <path
            d={`M0 ${BUMP_DEPTH}V0q${half} ${BUMP_DEPTH} ${BUMP_WIDTH} 0V${BUMP_DEPTH}z`}
            style={{ fill: into }}
          />
        </pattern>
      </defs>
      <rect width="100%" height={BUMP_DEPTH} fill={`url(#${id})`} />
    </svg>
  );
}

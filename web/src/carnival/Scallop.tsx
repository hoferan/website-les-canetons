import { useId } from "react";

const BUMP_WIDTH = 40;
const BUMP_DEPTH = 22;
// How far a `from` edge reaches up into the surface above. Two surfaces that
// meet at a fractional pixel (the home page's yellow band ends at 1851.875px)
// can leave a row between them that neither covers, and the cream behind
// shows as a hairline. Painting the bump colour one pixel up into the upper
// surface closes it.
const OVERLAP = 1;

/**
 * The scalloped edge where a surface ends: round bumps of the surface hanging
 * down into whatever comes next (ADR 0029).
 *
 * Two ways round, for the two places an edge can be drawn from:
 *
 * - `into`: drawn at the bottom of the upper surface. It paints the NEXT
 *   colour over that surface's bottom and leaves the bumps transparent, so the
 *   surface can be a gradient, as the home page hero is, and the bumps still
 *   match it. The surface has to be `relative` and leave BUMP_DEPTH of padding
 *   at its bottom.
 * - `from`: drawn at the top of the lower surface, which is how the footer
 *   does it. It paints the bumps themselves, in the colour of whatever sits
 *   above, so the upper surface has to be flat. The lower one has to be
 *   `relative` and leave BUMP_DEPTH of padding at its top.
 *
 * Either colour is any CSS colour, `var()` included, which is why it is set
 * as a style rather than a `fill` attribute.
 *
 * A pattern in pixels rather than one path stretched to the width, so a bump is
 * 40px at 390px and at 1280px alike; a stretched path squashes into a zigzag
 * on a phone.
 */
export function Scallop(props: { into: string } | { from: string }) {
  // React's ids carry punctuation that does not survive inside url(#…).
  const id = `scallop-${useId().replace(/[^\w-]/g, "")}`;
  const half = BUMP_WIDTH / 2;
  const top = "from" in props;
  const height = top ? BUMP_DEPTH + OVERLAP : BUMP_DEPTH;

  return (
    <svg
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 block w-full ${top ? "-top-px" : "bottom-0"}`}
      height={height}
    >
      <defs>
        <pattern id={id} width={BUMP_WIDTH} height={height} patternUnits="userSpaceOnUse">
          {top ? (
            <path
              d={`M0 0H${BUMP_WIDTH}V${OVERLAP}q-${half} ${BUMP_DEPTH} -${BUMP_WIDTH} 0z`}
              style={{ fill: props.from }}
            />
          ) : (
            <path
              d={`M0 ${BUMP_DEPTH}V0q${half} ${BUMP_DEPTH} ${BUMP_WIDTH} 0V${BUMP_DEPTH}z`}
              style={{ fill: props.into }}
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  );
}

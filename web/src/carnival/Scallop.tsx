import { useId } from "react";

const BUMP_WIDTH = 40;
const BUMP_DEPTH = 22;
// How far an edge reaches past the line where its two surfaces meet: a `from`
// edge one pixel up into the surface above, an `into` edge one pixel down into
// the surface below. Two surfaces that meet at a fractional pixel (the home
// page's yellow band ends at 1851.875px) leave a device row that each covers
// only in part, and what is behind them shows through as a hairline. Painting
// the edge's colour one pixel past that row closes it.
const OVERLAP = 1;
// How much taller a pattern tile is than the strip it fills. Where the strip
// ends on a fraction of a device pixel (a zoom of 125%, say), the browser
// samples the pattern a little past the strip. With a tile as tall as the
// strip that sample is the next tile's first row: the `from` edge's solid top,
// a hairline of the upper colour across the lower surface. The first extra row
// continues the strip's bottom (the next colour for an `into` edge, nothing
// for a `from` one), and the second stays empty for a sample just above the
// strip's top.
const SPARE_ROWS = 2;

/**
 * The classes for a surface that clips its content and carries an `into`
 * edge: the clip lets the edge's overlap through. Clipped at the surface's own
 * fractional bottom, the edge would cover that row exactly as far as the
 * surface's background does, and the background would show through as a
 * hairline. A browser without `overflow-clip-margin` clips at the edge and
 * shows the hairline, as before.
 */
export const SCALLOP_CLIP = "overflow-clip [overflow-clip-margin:1px]";

/**
 * The scalloped edge where a surface ends: round bumps of the surface hanging
 * down into whatever comes next (ADR 0029).
 *
 * Two ways round, for the two places an edge can be drawn from:
 *
 * - `into`: drawn at the bottom of the upper surface. It paints the NEXT
 *   colour over that surface's bottom and leaves the bumps transparent, so the
 *   surface can be a gradient, as the home page hero is, and the bumps still
 *   match it. The surface has to be `relative`, leave BUMP_DEPTH of padding
 *   at its bottom, and clip with {@link SCALLOP_CLIP} if it clips at all.
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
  const height = BUMP_DEPTH + OVERLAP;
  // The `into` colour's bottom, one row past the strip (see SPARE_ROWS).
  const below = height + 1;

  return (
    <svg
      aria-hidden="true"
      // The fade around a block being edited covers its bumps (fadeAround).
      data-scallop
      className={`pointer-events-none absolute left-0 block w-full ${top ? "-top-px" : "-bottom-px"}`}
      height={height}
    >
      <defs>
        <pattern
          id={id}
          width={BUMP_WIDTH}
          height={height + SPARE_ROWS}
          patternUnits="userSpaceOnUse"
        >
          {top ? (
            <path
              d={`M0 0H${BUMP_WIDTH}V${OVERLAP}q-${half} ${BUMP_DEPTH} -${BUMP_WIDTH} 0z`}
              style={{ fill: props.from }}
            />
          ) : (
            <path
              d={`M0 ${below}V0q${half} ${BUMP_DEPTH} ${BUMP_WIDTH} 0V${below}z`}
              style={{ fill: props.into }}
            />
          )}
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  );
}

/**
 * Measures the focus ring an element wears now, for a story's play function,
 * which runs in Chromium where colours are painted (ADR 0047).
 *
 * The ring is the `focus-ring` outline, drawn 2px outside the element, so
 * what it must stand out from is the ground behind the element: the nearest
 * ancestor that paints a background. Stories render on the cream page. On a
 * gradient, such as the hero's poster, the contrast is the lowest against any
 * of its colours.
 *
 * It waits for the element's transitions first: a control with
 * `transition-all` animates the outline in, and read at once it is still 3px
 * wide and partway to its colour.
 */
export async function measureFocusRing(element: Element) {
  await Promise.all(element.getAnimations().map((animation) => animation.finished));
  const style = getComputedStyle(element);
  let under = ["rgb(255, 255, 255)"];
  for (let ground = element.parentElement; ground; ground = ground.parentElement) {
    const painted = getComputedStyle(ground);
    const stops = painted.backgroundImage.includes("gradient")
      ? (painted.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [])
      : [];
    if (stops.length) {
      under = stops;
      break;
    }
    if (!isTransparent(painted.backgroundColor)) {
      under = [painted.backgroundColor];
      break;
    }
  }
  const ring = luminance(style.outlineColor);
  const contrast = Math.min(
    ...under.map((colour) => {
      const back = luminance(colour);
      return (Math.max(ring, back) + 0.05) / (Math.min(ring, back) + 0.05);
    }),
  );
  return {
    /** "solid 2px" when the one focus ring is on. */
    ring: `${style.outlineStyle} ${style.outlineWidth}`,
    colour: style.outlineColor,
    ground: under.join(" / "),
    contrast,
  };
}

function isTransparent(colour: string) {
  return colour === "transparent" || /^rgba\(.*,\s*0\)$/.test(colour);
}

/** WCAG relative luminance of an `rgb()`/`rgba()` colour. */
function luminance(colour: string) {
  const channels = (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((value) => Number(value) / 255);
  return channels
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, index) => sum + c * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
}

/** How far the rest of the page fades toward the paper while a block is edited. */
const FADE_EDITING = 70;
/** Less in "Aperçu", where the block is judged against the page around it. */
const FADE_PREVIEW = 45;

const fadeColour = (fade: number) =>
  `color-mix(in srgb, var(--color-ground) ${fade}%, transparent)`;

/**
 * Fades the whole page except one block toward the paper colour (#357), the
 * same for a card, a hero or the footer: the block stays as a visitor sees
 * it, and the faded page says that it is not the one being changed and
 * cannot be clicked.
 *
 * The fade is a fixed element outside the page whose huge box-shadow covers
 * everything but its own box, laid over the block. Drawn inside the block, a
 * clipped hero would cut it. A card's hard shadow is part of the card, so the
 * hole takes it in.
 *
 * A scalloped edge inside the block (`Scallop`) paints its bumps in the
 * colour of the neighbouring surface, which fades. Each one gets a copy laid
 * over it whose bumps are the fade itself, so they fade with their surface.
 *
 * `find` is asked every frame: the block can be re-rendered as another
 * element while it is edited (a card that is a link drops its edit chips and
 * becomes one), or appear only once its editor has put it on the page, as a
 * new card does. While it finds none the whole page fades.
 *
 * Returns what takes it away again.
 */
export function fadeAround(find: () => HTMLElement | null, preview: () => boolean): () => void {
  const layer = document.createElement("div");
  layer.setAttribute("data-edit-fade", "");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    zIndex: "40",
    pointerEvents: "none",
  });
  const hole = document.createElement("div");
  Object.assign(hole.style, { position: "fixed", transition: "box-shadow 200ms" });
  layer.appendChild(hole);
  document.body.appendChild(layer);

  let block: HTMLElement | null = null;
  let offset = { x: 0, y: 0 };
  let turn = "none";
  let edges: { edge: SVGSVGElement; copy: SVGSVGElement }[] = [];

  const follow = (found: HTMLElement | null) => {
    block = found;
    edges.forEach(({ copy }) => copy.remove());
    edges = [];
    if (!found) return;
    const style = getComputedStyle(found);
    offset = shadowOffset(style.boxShadow);
    turn = turnOf(found);
    hole.style.borderRadius = style.borderRadius;
    edges = [...found.querySelectorAll<SVGSVGElement>("svg[data-scallop]")].map((edge) => {
      const copy = fadedCopy(edge);
      layer.appendChild(copy);
      return { edge, copy };
    });
  };

  let frame = 0;
  const draw = () => {
    const found = find();
    if (found !== block) follow(found);
    const colour = fadeColour(preview() ? FADE_PREVIEW : FADE_EDITING);
    layer.style.setProperty("--edit-fade", colour);
    if (block) {
      // The block's own size, turned as the page turns it (the home page's
      // cards are tilted), centred where the browser draws it: the box the
      // browser reports for a turned block is wider, and would leave the
      // surface behind its corners unfaded.
      const box = block.getBoundingClientRect();
      const width = block.offsetWidth || box.width;
      const height = block.offsetHeight || box.height;
      Object.assign(hole.style, {
        left: `${box.left + box.width / 2 - width / 2 + Math.min(0, offset.x)}px`,
        top: `${box.top + box.height / 2 - height / 2 + Math.min(0, offset.y)}px`,
        width: `${width + Math.abs(offset.x)}px`,
        height: `${height + Math.abs(offset.y)}px`,
        transformOrigin: `${width / 2 - Math.min(0, offset.x)}px ${height / 2 - Math.min(0, offset.y)}px`,
        transform: turn,
        boxShadow: `0 0 0 200vmax ${colour}`,
      });
      for (const { edge, copy } of edges) {
        const strip = edge.getBoundingClientRect();
        // An edge reaches a pixel past its block to close a hairline. That
        // pixel is outside the hole and faded already; covered again, it
        // shows as a pale line.
        const above = Math.max(0, box.top - strip.top);
        const below = Math.max(0, strip.bottom - box.bottom);
        Object.assign(copy.style, {
          left: `${strip.left}px`,
          top: `${strip.top}px`,
          width: `${strip.width}px`,
          clipPath: `inset(${above}px 0px ${below}px)`,
        });
      }
    } else {
      Object.assign(hole.style, {
        width: "0px",
        height: "0px",
        boxShadow: `0 0 0 200vmax ${colour}`,
      });
    }
    frame = requestAnimationFrame(draw);
  };
  draw();

  return () => {
    cancelAnimationFrame(frame);
    layer.remove();
  };
}

/**
 * The rotation and scale the page applies to an element, from its own
 * `rotate`, `scale` and `transform` and its ancestors', without translation:
 * the hole is placed by the element's centre instead. Tailwind 4's
 * `rotate-1` sets the `rotate` property, which `transform` does not include.
 * "none" when nothing turns it, or where the browser has no DOMMatrix.
 */
export function turnOf(element: Element): string {
  if (typeof DOMMatrix === "undefined") return "none";
  let matrix = new DOMMatrix();
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const own = new DOMMatrix();
    const angle = /^(-?[\d.]+)deg$/.exec(style.rotate ?? "")?.[1];
    if (angle) own.rotateSelf(parseFloat(angle));
    const scale = (style.scale ?? "none").split(" ").map(parseFloat);
    if (!Number.isNaN(scale[0])) own.scaleSelf(scale[0], scale[1] ?? scale[0]);
    if (style.transform && style.transform !== "none") {
      own.multiplySelf(new DOMMatrix(style.transform));
    }
    matrix = own.multiply(matrix);
  }
  const { a, b, c, d } = matrix;
  if (a === 1 && b === 0 && c === 0 && d === 1) return "none";
  return `matrix(${a}, ${b}, ${c}, ${d}, 0, 0)`;
}

/**
 * A copy of a scalloped edge, fixed in place, whose bumps are painted with
 * the fade (`--edit-fade` on the layer). Its pattern gets an id of its own:
 * `url(#id)` resolves to the first element with that id, the original's.
 */
function fadedCopy(edge: SVGSVGElement): SVGSVGElement {
  const copy = edge.cloneNode(true) as SVGSVGElement;
  const pattern = copy.querySelector("pattern");
  if (pattern) {
    pattern.id = `${pattern.id}-faded`;
    copy.querySelector("rect")?.setAttribute("fill", `url(#${pattern.id})`);
  }
  copy.querySelectorAll<SVGPathElement>("path").forEach((path) => {
    path.style.fill = "var(--edit-fade)";
  });
  copy.removeAttribute("class");
  Object.assign(copy.style, { position: "fixed", display: "block" });
  return copy;
}

/**
 * The offset of an element's first outer box-shadow, as getComputedStyle
 * writes it ("rgb(20, 18, 28) 6px 6px 0px 0px"); none for "none" or an inset
 * one.
 */
export function shadowOffset(boxShadow: string): { x: number; y: number } {
  const first = boxShadow.split(/,(?![^(]*\))/)[0] ?? "";
  if (first.trim() === "none" || first.includes("inset")) return { x: 0, y: 0 };
  const lengths = first.replace(/rgba?\([^)]*\)/, "").match(/-?\d+(\.\d+)?px/g) ?? [];
  return { x: parseFloat(lengths[0] ?? "0"), y: parseFloat(lengths[1] ?? "0") };
}

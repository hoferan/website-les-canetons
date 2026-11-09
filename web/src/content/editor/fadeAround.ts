/** How far the rest of the page fades toward the paper while a block is edited. */
const FADE_EDITING = 70;
/** Less in "Aperçu", where the block is judged against the page around it. */
const FADE_PREVIEW = 45;

/**
 * Fades the whole page except one block toward the paper colour (#357), the
 * same for a card, a hero or the footer: the block stays as a visitor sees
 * it, and the faded page says that it is not the one being changed and
 * cannot be clicked.
 *
 * The fade is a fixed element outside the page whose huge box-shadow covers
 * everything but its own box, laid over the block. Drawn inside the block, a
 * hero's scalloped clip-path would cut it. The box follows the block every
 * frame, since the page scrolls and the block changes size as it is typed.
 * A card's hard shadow is part of the card, so the hole takes it in.
 *
 * Returns what takes it away again.
 */
export function fadeAround(block: HTMLElement, preview: () => boolean): () => void {
  const hole = document.createElement("div");
  hole.setAttribute("data-edit-fade", "");
  hole.setAttribute("aria-hidden", "true");
  Object.assign(hole.style, {
    position: "fixed",
    zIndex: "40",
    pointerEvents: "none",
    transition: "box-shadow 200ms",
  });
  document.body.appendChild(hole);

  const style = getComputedStyle(block);
  const { x, y } = shadowOffset(style.boxShadow);
  hole.style.borderRadius = style.borderRadius;

  let frame = 0;
  const draw = () => {
    const box = block.getBoundingClientRect();
    const fade = preview() ? FADE_PREVIEW : FADE_EDITING;
    Object.assign(hole.style, {
      left: `${box.left + Math.min(0, x)}px`,
      top: `${box.top + Math.min(0, y)}px`,
      width: `${box.width + Math.abs(x)}px`,
      height: `${box.height + Math.abs(y)}px`,
      boxShadow: `0 0 0 200vmax color-mix(in srgb, var(--color-ground) ${fade}%, transparent)`,
    });
    frame = requestAnimationFrame(draw);
  };
  draw();

  return () => {
    cancelAnimationFrame(frame);
    hole.remove();
  };
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

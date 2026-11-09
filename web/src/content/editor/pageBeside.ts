import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { fadeAround } from "./fadeAround";

/**
 * From this width the editor is a panel docked at the right and the page
 * moves over beside it; below, a sheet rises from the bottom over the page.
 * At 1024px a docked panel would leave the page 624px while it kept its wide
 * layout, which breaks the header and the card grids, hence xl.
 */
export const DOCKED_PX = 1280;
/** The docked panel's width, which the page gives up. */
export const PANEL_PX = 400;

/** The page's own root, which the editor makes inert and moves aside. */
const pageRoot = () => document.getElementById("root");

/** The page's sticky bar on a phone ("Menu"), which covers the top of the page. */
function stickyBarHeight(): number {
  const bar = document.querySelector<HTMLElement>(".sticky.top-0");
  return bar && getComputedStyle(bar).position === "sticky" ? bar.offsetHeight : 0;
}

/**
 * What an open block editor does to the page around it (#357), which is its
 * preview:
 *
 * - The page cannot be clicked or focused (`inert`), and from DOCKED_PX it
 *   moves aside for the panel.
 * - Everything but the block fades (`fadeAround`).
 * - The block is scrolled into the part of the page left in view: centred
 *   beside the panel, or just under the sticky bar above the sheet. Again
 *   when the sheet is lowered to its bar or raised.
 * - On a phone the page gets room under its last block, as tall as what
 *   covers it, so the footer can rise above the sheet.
 *
 * The block is the one the editor was opened from: the nearest
 * `[data-edit-block]` around the focused chip. None found, the page is only
 * made inert.
 *
 * `sheet` is the editor's own element, measured for the room under the page.
 */
export function usePageBeside(open: boolean, lowered: boolean, sheet: () => HTMLElement | null) {
  const block = useRef<HTMLElement | null>(null);
  const loweredNow = useRef(lowered);
  loweredNow.current = lowered;

  useLayoutEffect(() => {
    const root = pageRoot();
    if (!open || !root) return;
    // Still the chip the editor was opened from: Radix moves focus in later.
    block.current = document.activeElement?.closest<HTMLElement>("[data-edit-block]") ?? null;
    root.inert = true;
    if (window.innerWidth >= DOCKED_PX) root.style.marginRight = `${PANEL_PX}px`;
    const unfade = block.current ? fadeAround(block.current, () => loweredNow.current) : () => {};
    return () => {
      unfade();
      root.inert = false;
      root.style.marginRight = "";
      root.style.paddingBottom = "";
      block.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // A frame later: the page drops its edit chips once the editor opens,
    // which moves the block up.
    const frame = requestAnimationFrame(() => {
      const target = block.current;
      const root = pageRoot();
      if (!target || !root) return;
      const docked = window.innerWidth >= DOCKED_PX;
      if (!docked) {
        const height = sheet()?.offsetHeight ?? 0;
        root.style.paddingBottom = lowered ? `${height}px` : "90dvh";
      }
      const top = target.getBoundingClientRect().top + window.scrollY;
      const y = docked
        ? top - Math.max(16, (window.innerHeight - target.offsetHeight) / 2)
        : top - stickyBarHeight();
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, lowered, sheet]);
}

/**
 * Where the sheet sits while the phone's keyboard is up: on the part of the
 * screen the keyboard leaves (the visual viewport), so the Save row stays
 * above it. Undefined when docked, or where the browser does not say.
 */
export function useKeyboardRoom(open: boolean, lowered: boolean): CSSProperties | undefined {
  const [room, setRoom] = useState<{ height: number; bottom: number } | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const update = () =>
      setRoom({
        height: viewport.height,
        bottom: Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop),
      });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);

  if (!room || window.innerWidth >= DOCKED_PX) return undefined;
  return lowered
    ? { bottom: room.bottom }
    : { bottom: room.bottom, maxHeight: Math.round(room.height * 0.9) };
}

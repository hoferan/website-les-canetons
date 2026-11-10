import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { useLocale } from "../../i18n/routing";
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
 * The block is the element marked `data-edit-block={target}`, looked up
 * whenever it is needed rather than kept: a card that is a link renders as
 * another element once the chips go, and a new card appears only once the
 * editor has put it on the page.
 *
 * `sheet` is the editor's own element, measured for the room under the page.
 */
export function usePageBeside(
  open: boolean,
  lowered: boolean,
  target: string,
  sheet: () => HTMLElement | null,
) {
  const loweredNow = useRef(lowered);
  loweredNow.current = lowered;

  useLayoutEffect(() => {
    const root = pageRoot();
    if (!open || !root) return;
    root.inert = true;
    if (window.innerWidth >= DOCKED_PX) root.style.marginRight = `${PANEL_PX}px`;
    const unfade = fadeAround(
      () => findBlock(target),
      () => loweredNow.current,
    );
    return () => {
      unfade();
      root.inert = false;
      root.style.marginRight = "";
      root.style.paddingBottom = "";
    };
  }, [open, target]);

  // A change of language keeps the editor open but moves the block, since the
  // other language's texts are longer or shorter: the block is placed again.
  const locale = useLocale();

  useEffect(() => {
    if (!open) return;
    // From the next frame on: the page drops its edit chips once the editor
    // opens, which moves the block, and a new card is not there yet.
    let tries = 0;
    let frame = requestAnimationFrame(function place() {
      const block = findBlock(target);
      const root = pageRoot();
      if (!root) return;
      if (!block) {
        if (++tries < 30) frame = requestAnimationFrame(place);
        return;
      }
      const docked = window.innerWidth >= DOCKED_PX;
      if (!docked) {
        const height = sheet()?.offsetHeight ?? 0;
        root.style.paddingBottom = lowered ? `${height}px` : "90dvh";
      }
      const top = block.getBoundingClientRect().top + window.scrollY;
      const y = docked
        ? top - Math.max(16, (window.innerHeight - block.offsetHeight) / 2)
        : top - stickyBarHeight();
      window.scrollTo({ top: Math.max(0, y), behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, lowered, target, sheet, locale]);
}

/** The block an editor changes, as the page renders it now. */
function findBlock(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-edit-block="${CSS.escape(target)}"]`);
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

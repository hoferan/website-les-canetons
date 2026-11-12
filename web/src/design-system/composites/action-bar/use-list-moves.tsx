import * as React from "react";

import type { ActionBarAction } from "./action-bar";

type Direction = "before" | "after";

type PendingMove = {
  key: string;
  direction: Direction;
  keyboard: boolean;
  x: number;
  y: number;
  rects: Map<string, DOMRect>;
};

export type ListMoves = {
  /** The ref for the element of the item `key`: it slides, pulses and holds the item's bar. */
  itemRef: (key: string) => (element: HTMLElement | null) => void;
  /**
   * The move arrow of `key` toward `direction`, for its bar's `actions`. At an
   * end it is disabled, keeping its slot.
   */
  moveAction: (
    key: string,
    direction: Direction,
    text: { label: string; word: string },
  ) => ActionBarAction;
  /** A polite live region that says where the item went. Render it once, near the list. */
  liveRegion: React.ReactElement;
};

/** A tap this soon and this close to the last move is the same finger again. */
const TAP_GUARD_MS = 1000;
const TAP_GUARD_PX = 30;

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** A violet outline, once: the moved item shows where it went. */
function pulse(element: HTMLElement) {
  if (typeof element.animate !== "function") return;
  const violet = getComputedStyle(element).getPropertyValue("--color-focus").trim() || "#4b2ed6";
  if (reducedMotion()) {
    const still = { outline: `4px solid ${violet}`, outlineOffset: "2px" };
    element.animate([still, still], { duration: 900 });
    return;
  }
  element.animate(
    [
      { outline: `6px solid ${violet}`, outlineOffset: "2px" },
      { outline: "6px solid transparent", outlineOffset: "2px" },
    ],
    { duration: 600, easing: "cubic-bezier(.2,.8,.2,1)" },
  );
}

/**
 * The move rules for a list whose items wear an {@link ActionBar} (ADR 0043).
 * The caller owns the order and changes it in `onMove`; once `keys` arrive in
 * the new order:
 *
 * - the items slide to their new places and the moved one pulses;
 * - focus stays on the same arrow of the moved item, or on its main action at
 *   an end, and shows as keyboard focus only if the move came from the keyboard;
 * - the live region says "position 2 of 4", in the words `announce` returns;
 * - an arrow of another item that a pointer move left under the pointer ignores
 *   clicks until the pointer leaves it, so a second click cannot swap the two
 *   back, and on touch a tap within a second and 30px of the last move is
 *   ignored.
 */
export function useListMoves({
  keys,
  onMove,
  announce,
}: {
  keys: readonly string[];
  onMove: (key: string, to: number) => void;
  announce: (key: string, position: number, count: number) => string;
}): ListMoves {
  const items = React.useRef(new Map<string, HTMLElement>());
  const pending = React.useRef<PendingMove | null>(null);
  const lastMove = React.useRef<{ at: number; x: number; y: number } | null>(null);
  const [said, setSaid] = React.useState({ text: "", count: 0 });

  const order = keys.join("\u0000");
  React.useLayoutEffect(() => {
    const move = pending.current;
    const index = keys.indexOf(move?.key ?? "");
    if (!move || index < 0) return;
    pending.current = null;
    const moved = items.current.get(move.key);
    if (!moved) return;

    // Before the slide starts, while every item stands where it now belongs.
    if (!move.keyboard) {
      const under = document.elementFromPoint?.(move.x, move.y)?.closest("[data-move]");
      if (under && !moved.contains(under)) under.setAttribute("data-blocked", "");
    }

    if (!reducedMotion()) {
      for (const [key, before] of move.rects) {
        const element = items.current.get(key);
        if (!element || typeof element.animate !== "function") continue;
        const after = element.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (dx === 0 && dy === 0) continue;
        element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 260,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
    }
    pulse(moved);

    setSaid((current) => ({
      text: announce(move.key, index + 1, keys.length),
      count: current.count + 1,
    }));

    const target =
      moved.querySelector<HTMLElement>(`[data-move="${move.direction}"]:not([aria-disabled])`) ??
      moved.querySelector<HTMLElement>("[data-main]");
    // focusVisible: false keeps a mouse move from drawing the keyboard's focus.
    target?.focus({ focusVisible: move.keyboard } as FocusOptions);
    // `keys` is read through `order`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const itemRef = React.useCallback(
    (key: string) => (element: HTMLElement | null) => {
      if (element) items.current.set(key, element);
      else items.current.delete(key);
    },
    [],
  );

  const moveAction = (
    key: string,
    direction: Direction,
    text: { label: string; word: string },
  ): ActionBarAction => {
    const index = keys.indexOf(key);
    const to = direction === "before" ? index - 1 : index + 1;
    const disabled = index < 0 || to < 0 || to >= keys.length;
    return {
      id: direction,
      move: direction,
      label: text.label,
      word: text.word,
      disabled,
      onSelect: (event) => {
        if (disabled) return;
        const keyboard = event.detail === 0;
        const native = event.nativeEvent as Partial<PointerEvent>;
        const now = Date.now();
        const last = lastMove.current;
        if (
          native.pointerType === "touch" &&
          last &&
          now - last.at < TAP_GUARD_MS &&
          Math.hypot(event.clientX - last.x, event.clientY - last.y) < TAP_GUARD_PX
        ) {
          return;
        }
        const rects = new Map<string, DOMRect>();
        for (const [itemKey, element] of items.current) {
          rects.set(itemKey, element.getBoundingClientRect());
        }
        pending.current = { key, direction, keyboard, x: event.clientX, y: event.clientY, rects };
        lastMove.current = { at: now, x: event.clientX, y: event.clientY };
        onMove(key, to);
      },
    };
  };

  const liveRegion = (
    <span aria-live="polite" className="sr-only">
      {said.text ? <span key={said.count}>{said.text}</span> : null}
    </span>
  );

  return { itemRef, moveAction, liveRegion };
}

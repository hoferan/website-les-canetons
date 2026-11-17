import type * as React from "react";
import { Tooltip } from "radix-ui";

/**
 * IconButton's word, the tip above the button on hover and keyboard focus.
 * In a chunk of its own (#476): none of the landing pages has an icon
 * button, so a visitor never downloads Radix's tooltip and its positioning.
 *
 * It is a Radix tooltip in a portal, because a row sits inside scrolling
 * dialogs and clipped cards that would cut it off. Radix already ignores
 * touch, since a tap is not a hover.
 */
export function IconButtonTip({
  word,
  open,
  children,
}: {
  word: string;
  /** Keeps the tip open, for the catalogue's screenshot. */
  open: boolean;
  /** The button. */
  children: React.ReactElement;
}) {
  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root open={open || undefined}>
        <Tooltip.Trigger asChild onFocus={keyboardFocusOnly}>
          {children}
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            sideOffset={8}
            className="z-50 animate-roll-up rounded-lg bg-ink px-2.5 py-1.5 text-[13px] leading-none font-medium whitespace-nowrap text-white"
          >
            {word}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/**
 * Radix opens a tooltip on any focus, but only focus the user moved with Tab
 * or an arrow key opens it here.
 *
 * Focus that a dialog or menu moves itself would otherwise open one: onto the
 * opener after a click, where the tip would hang, or onto a dialog's first
 * control after Enter opened it. A tip there is a dismissable layer above the
 * dialog, so the first Escape would close the tip and leave the dialog open.
 * (jsdom never matches :focus-visible on a button, so it cannot decide this.)
 */
const FOCUS_KEYS = new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

let focusMovedByKey = false;

const onKeyDown = (event: KeyboardEvent) => {
  // Shift and the other modifiers come before the Tab they modify.
  if (MODIFIERS.has(event.key)) return;
  focusMovedByKey = FOCUS_KEYS.has(event.key);
};
const onPointerDown = () => {
  focusMovedByKey = false;
};

if (typeof document !== "undefined") {
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  // A hot reload runs this module again; drop the old listeners first.
  import.meta.hot?.dispose(() => {
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
  });
}

function keyboardFocusOnly(event: React.FocusEvent<HTMLButtonElement>) {
  // Radix skips its own handler once the event is marked prevented.
  if (!focusMovedByKey) event.preventDefault();
}

import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Slot, Tooltip } from "radix-ui";

import { cn } from "@/lib/utils";

import { buttonVariants } from "@ds";

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  /** The accessible name, which says which row it acts on: "Monter Cloches". */
  label: string;
  /** The short visible word: "Monter". Defaults to the label. */
  word?: string;
  variant?: Variant;
  size?: "default" | "sm";
  surface?: "page" | "stage";
  /** Renders the single child, a `<Link>`, with the look, the icon and the word. */
  asChild?: boolean;
  /** Keeps the tip open, for the catalogue's screenshot. */
  showWord?: boolean;
  children?: React.ReactElement;
};

/**
 * The only way to render an icon-only button (ADR 0025 decides where one
 * goes). On hover and keyboard focus its word shows as a small ink label
 * above the button, so nobody has to guess what the icon does and a row's
 * neighbours stay put. It is a Radix tooltip in a portal, because a row sits
 * inside scrolling dialogs and clipped cards that would cut it off. Radix
 * already ignores touch, since a tap is not a hover.
 *
 * Edit controls on the page use the action bar instead (ADR 0043).
 */
export function IconButton({
  icon: Icon,
  label,
  word = label,
  variant = "secondary",
  size = "default",
  surface = "page",
  asChild = false,
  showWord = false,
  className,
  children,
  ...props
}: IconButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  const button = (
    <Comp
      aria-label={label}
      className={cn(
        buttonVariants({ variant, surface, size: size === "sm" ? "icon-sm" : "icon" }),
        className,
      )}
      {...props}
      // After the spread: a wrapper's own slot (DialogClose passes
      // "dialog-close") would otherwise replace it, and styles.css keys the
      // quiet variant's missing underline on this one.
      data-slot="icon-button"
      // The tip repeats the name, so it is not announced again as a
      // description.
      aria-describedby={props["aria-describedby"]}
    >
      <Icon aria-hidden="true" />
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
    </Comp>
  );

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root open={showWord || undefined}>
        <Tooltip.Trigger asChild onFocus={keyboardFocusOnly}>
          {button}
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

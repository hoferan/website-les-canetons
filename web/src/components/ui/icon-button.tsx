import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Slot, Tooltip } from "radix-ui";

import { cn } from "@/lib/utils";

import { buttonVariants } from "./button";

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  /** Replaces `icon` below `sm`, for an arrow whose direction follows a layout that stacks on a phone. */
  narrowIcon?: LucideIcon;
  /** The accessible name, which says which row it acts on: "Monter Cloches". */
  label: string;
  /** The short visible word: "Monter". Defaults to the label. */
  word?: string;
  /** `tip` for icons in rows, `grow` for floating chips. */
  mode?: "tip" | "grow";
  variant?: Variant;
  size?: "default" | "sm";
  surface?: "page" | "stage";
  /** Renders the single child, a `<Link>`, with the look, the icon and the word. */
  asChild?: boolean;
  /** Keeps the word shown, for the catalogue's screenshot. */
  showWord?: boolean;
  children?: React.ReactElement;
};

/**
 * The only way to render an icon-only button (ADR 0025 decides where one
 * goes). On hover and keyboard focus its word rolls up, so nobody has to
 * guess what the icon does. Touch shows no word, since a tap is not a hover.
 *
 * `tip` shows the word as a small ink label above the button, so a row's
 * neighbours stay put. It is a Radix tooltip in a portal, because a row sits
 * inside scrolling dialogs and clipped cards that would cut it off. Radix
 * already ignores touch.
 *
 * `grow` widens the button in place and the word rises into it, for a chip
 * that has nothing beside it to cover. From `sm` up only: a phone has no
 * room for the wider chip.
 */
export function IconButton({
  icon: Icon,
  narrowIcon: NarrowIcon,
  label,
  word = label,
  mode = "tip",
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
  const grow = mode === "grow";
  const iconSize = grow ? "size-5 shrink-0" : undefined;

  const button = (
    <Comp
      data-slot="icon-button"
      data-mode={mode}
      aria-label={label}
      className={cn(
        grow
          ? // EditChip's 44px chip. gap-0 because the closed word still
            // counts as a flex item and would add the gap beside the icon.
            [buttonVariants({ variant, surface }), "group/icon h-11 min-w-11 gap-0 px-3"]
          : buttonVariants({ variant, surface, size: size === "sm" ? "icon-sm" : "icon" }),
        className,
      )}
      {...props}
      // The tip repeats the name, so it is not announced again as a
      // description.
      aria-describedby={props["aria-describedby"]}
    >
      {NarrowIcon ? (
        <>
          <NarrowIcon aria-hidden="true" className={cn(iconSize, "sm:hidden")} />
          <Icon aria-hidden="true" className={cn(iconSize, "hidden sm:block")} />
        </>
      ) : (
        <Icon aria-hidden="true" className={iconSize} />
      )}
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
      {grow ? <GrowingWord word={word} open={showWord} /> : null}
    </Comp>
  );

  if (grow) return button;

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
 * The word inside a `grow` button: a wrapper that widens from nothing, and
 * the text rising into it a beat later. Hover (Tailwind's `hover:` applies
 * only on devices that can hover) and keyboard focus open it; a press does not.
 * The reduced-motion block in styles.css stops both transitions.
 */
function GrowingWord({ word, open }: { word: string; open: boolean }) {
  return (
    <span
      className={cn(
        "inline-grid overflow-hidden transition-[max-width] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        open
          ? "max-w-56"
          : "max-w-0 sm:group-hover/icon:max-w-56 sm:group-focus-visible/icon:max-w-56",
      )}
    >
      <span
        className={cn(
          "block pr-1 pl-2 text-sm font-medium transition-[translate,opacity] delay-[40ms] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          !open &&
            "translate-y-full opacity-0 sm:group-hover/icon:translate-y-0 sm:group-hover/icon:opacity-100 sm:group-focus-visible/icon:translate-y-0 sm:group-focus-visible/icon:opacity-100",
        )}
      >
        {word}
      </span>
    </span>
  );
}

/**
 * Radix opens a tooltip on any focus. A dialog or menu that hands focus back
 * to its opener after a click would then leave the tip hanging over it, so
 * only focus that follows a key press opens it, as with :focus-visible.
 * (jsdom never matches :focus-visible on a button, hence the tracking.)
 */
let lastInputWasKeyboard = false;

if (typeof document !== "undefined") {
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.metaKey && !event.altKey && !event.ctrlKey) lastInputWasKeyboard = true;
    },
    true,
  );
  document.addEventListener("pointerdown", () => (lastInputWasKeyboard = false), true);
}

function keyboardFocusOnly(event: React.FocusEvent<HTMLButtonElement>) {
  // Radix skips its own handler once the event is marked prevented.
  if (!lastInputWasKeyboard) event.preventDefault();
}

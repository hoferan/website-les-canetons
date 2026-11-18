import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { cn } from "../../internal/cn";
import { buttonVariants } from "../button";

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

type IconButtonProps = Omit<React.ComponentProps<"button">, "children"> & {
  icon: LucideIcon;
  /** The accessible name, which says which row it acts on: "Monter Cloches". */
  label: string;
  /** The short visible word: "Monter". Defaults to the label. */
  word?: string;
  variant?: Variant;
  size?: "default" | "sm";
  /** Renders the single child, a link, with the look, the icon and the word. */
  asChild?: boolean;
  /** Keeps the tip open, for the catalogue's screenshot. */
  showWord?: boolean;
  children?: React.ReactElement;
};

type Tip = typeof import("./icon-button-tip").IconButtonTip;

/**
 * The tip's component once its chunk is in (#476). The first icon button to
 * mount fetches it; every one mounted after that renders with it at once.
 */
let tip: Tip | undefined;
let tipLoading: Promise<void> | undefined;
const tipListeners = new Set<() => void>();

/** Fetches the tip. The first icon button to mount does; tests call it up front. */
export function loadIconButtonTip(): Promise<void> {
  tipLoading ??= import("./icon-button-tip").then((module) => {
    module.watchFocusKeys();
    tip = module.IconButtonTip;
    for (const listener of tipListeners) listener();
  });
  return tipLoading;
}

function subscribeToTip(onChange: () => void) {
  tipListeners.add(onChange);
  void loadIconButtonTip();
  return () => tipListeners.delete(onChange);
}

const currentTip = () => tip;

/**
 * The only way to render an icon-only button (ADR 0025 decides where one
 * goes). On hover and keyboard focus its word shows as a small ink label
 * above the button (./icon-button-tip.tsx), so nobody has to guess what the
 * icon does and a row's neighbours stay put.
 *
 * Until the tip's chunk is in, the button renders without it. Wrapping it
 * then replaces the button element, so a button that had the focus takes it
 * back.
 *
 * Edit controls on the page use the action bar instead (ADR 0043).
 */
export function IconButton({
  icon: Icon,
  label,
  word = label,
  variant = "secondary",
  size = "default",
  asChild = false,
  showWord = false,
  className,
  children,
  ref,
  ...props
}: IconButtonProps) {
  const Tip = React.useSyncExternalStore(subscribeToTip, currentTip, currentTip);
  const keepFocus = useFocusAcrossRemount(ref);
  const Comp = asChild ? Slot.Root : "button";
  const button = (
    <Comp
      ref={keepFocus}
      aria-label={label}
      className={cn(
        buttonVariants({ variant, size: size === "sm" ? "icon-sm" : "icon" }),
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

  return Tip ? (
    <Tip word={word} open={showWord}>
      {button}
    </Tip>
  ) : (
    button
  );
}

/**
 * A ref that hands the focus from a removed element to the one that replaces
 * it, and passes every element on to the caller's ref.
 *
 * React runs the old element's ref cleanup before it removes the element, so
 * the focus is still on it then.
 */
function useFocusAcrossRemount(outer: React.Ref<HTMLButtonElement> | undefined) {
  const hadFocus = React.useRef(false);
  return React.useCallback(
    (element: HTMLButtonElement | null) => {
      setRef(outer, element);
      if (element && hadFocus.current) {
        hadFocus.current = false;
        element.focus();
      }
      return () => {
        if (element && element === document.activeElement) hadFocus.current = true;
        setRef(outer, null);
      };
    },
    [outer],
  );
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

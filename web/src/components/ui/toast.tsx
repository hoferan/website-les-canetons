import { Check, createLucideIcon, X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { t } from "../../i18n";
import { Button } from "@ds";
import { IconButton } from "./icon-button";

/**
 * Every toast the app raises, as ADR 0042 sets it out: a level, one sentence,
 * at most one action and a close button. Call sites use `notify` and never
 * sonner's `toast`, which an ESLint rule enforces.
 *
 * Sonner still stacks, swipes and announces the toasts, and replaces one by
 * id. The clock is ours: sonner's runs forever, and the card closes itself.
 * Sonner pauses its own clock on hover and in a hidden tab but not on
 * keyboard focus, so a Tab onto the undo left it running out.
 */

export type ToastLevel = "success" | "info" | "warning" | "error";

export type ToastAction = { label: string; onClick: () => void; icon?: LucideIcon };

type ToastOptions = {
  /** Raising a toast under the id of one on screen replaces it. */
  id?: string;
  action?: ToastAction;
};

/** How long a toast stays, or null when it stays until closed. */
export function durationOf(level: ToastLevel, action?: ToastAction): number | null {
  if (level === "warning" || level === "error") return null;
  return action ? 10_000 : 5_000;
}

// The info and warning glyphs without lucide's circle or triangle, because
// the disc around them is the frame. The dot sits a stroke's width off the
// stem, or at strokeWidth 3 the two run together into a bar.
const InfoGlyph = createLucideIcon("toast-info", [
  ["path", { d: "M12 18v-6", key: "stem" }],
  ["path", { d: "M12 6.5h.01", key: "dot" }],
]);
const WarningGlyph = createLucideIcon("toast-warning", [
  ["path", { d: "M12 6v7", key: "stem" }],
  ["path", { d: "M12 18h.01", key: "dot" }],
]);

/**
 * Each level's column and its tint, the part a clock has already used. The
 * tint is the colour over the white body, so the icon keeps its ink contrast
 * at every height.
 */
const LEVELS: Record<ToastLevel, { icon: LucideIcon; fill: string; tint: string }> = {
  success: { icon: Check, fill: "bg-lime", tint: "bg-lime/28" },
  info: { icon: InfoGlyph, fill: "bg-cyan", tint: "bg-cyan/28" },
  warning: { icon: WarningGlyph, fill: "bg-yellow", tint: "bg-yellow/28" },
  error: { icon: X, fill: "bg-danger", tint: "bg-danger/28" },
};

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

const pageHidden = () => document.visibilityState === "hidden";

/**
 * Runs the clock while it is not paused, and draws what is left of it as the
 * height of `fill`. It writes the height straight to the element, once a
 * frame, so the toast does not re-render sixty times a second.
 *
 * A frame loop rather than a CSS transition, because the reduced-motion block
 * in styles.css shortens every transition to nothing: the column would empty
 * at once and say the toast was about to go.
 */
function useClock(
  duration: number | null,
  paused: boolean,
  fill: React.RefObject<HTMLElement | null>,
  onEnd: () => void,
) {
  const used = useRef(0);
  const end = useRef(onEnd);
  end.current = onEnd;

  useEffect(() => {
    if (duration === null || paused) return;
    let last = performance.now();
    // performance.now() in the loop too, not the frame's timestamp: both
    // share an origin in a browser, but not under every fake clock.
    let frame = requestAnimationFrame(function tick() {
      const now = performance.now();
      used.current += Math.max(0, now - last);
      last = now;
      const left = Math.max(0, 1 - used.current / duration);
      if (fill.current) fill.current.style.height = `${left * 100}%`;
      if (left === 0) {
        end.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [duration, paused, fill]);
}

type ToastCardProps = {
  level: ToastLevel;
  message: string;
  action?: ToastAction;
  onClose: () => void;
  /**
   * For the /dev/ui catalogue only: the share of the time left, drawn and
   * never run, so the screenshot shows the column part-empty.
   */
  frozenAt?: number;
};

/**
 * The card itself, which `notify` hands to sonner and /dev/ui renders as is.
 *
 * It sets its own width: sonner sizes only the toasts it styles, and leaves a
 * custom one as wide as its text. Up to 600px sonner stretches every toast
 * across the screen, and the card fills it.
 */
export function ToastCard({ level, message, action, onClose, frozenAt }: ToastCardProps) {
  const { icon: Icon, fill, tint } = LEVELS[level];
  const duration = durationOf(level, action);
  const hidden = useSyncExternalStore(subscribeToVisibility, pageHidden, () => false);
  const [pointerOver, setPointerOver] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const clock = useRef<HTMLSpanElement>(null);

  const frozen = frozenAt !== undefined;
  useClock(frozen ? null : duration, pointerOver || focusInside || hidden, clock, onClose);

  const ActionIcon = action?.icon;

  return (
    <div
      data-toast-level={level}
      onPointerEnter={() => setPointerOver(true)}
      onPointerLeave={() => setPointerOver(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusInside(false);
      }}
      className="grid min-h-18 w-full animate-toast-in min-[601px]:w-(--width) grid-cols-[3.875rem_1fr_auto] items-center gap-3 overflow-hidden rounded-2xl border-3 border-ink bg-panel pr-2 font-sans text-base text-ink shadow-toast"
    >
      {/* The column: the level's colour, and the clock as how much of it is
          left. A toast that stays has no clock and a full column. */}
      <span
        className={cn(
          "relative grid self-stretch place-items-center border-r-3 border-ink",
          duration === null ? fill : tint,
        )}
      >
        {duration !== null ? (
          <span
            ref={clock}
            data-toast-clock=""
            className={cn("absolute inset-x-0 bottom-0", fill)}
            style={{ height: `${(frozenAt ?? 1) * 100}%` }}
          />
        ) : null}
        <span className="relative grid size-9.5 place-items-center rounded-full border-3 border-ink bg-panel">
          <Icon aria-hidden="true" className="size-5" strokeWidth={3} />
        </span>
      </span>
      <p className="py-3 font-bold">{message}</p>
      <div className="flex items-center gap-1">
        {action ? (
          // Violet, the primary button: a white one vanished into the white
          // toast. André picked it from four mocked colours on #378.
          <Button
            type="button"
            variant="primary"
            size="sm"
            // A hook for tests that cannot query by role: a dialog open
            // beside the toast hides it from the accessibility tree.
            data-toast-action=""
            onClick={() => {
              action.onClick();
              onClose();
            }}
          >
            {ActionIcon ? <ActionIcon aria-hidden="true" /> : null}
            {action.label}
          </Button>
        ) : null}
        <IconButton
          type="button"
          variant="quiet"
          icon={X}
          label={t("toast.close")}
          onClick={onClose}
        />
      </div>
    </div>
  );
}

/**
 * A fresh key for every raise. A toast raised under the id of one on screen
 * replaces it in place, and without a new key React would keep the old card,
 * clock and all.
 */
let raised = 0;

function raise(level: ToastLevel, message: string, { id, action }: ToastOptions = {}) {
  const key = ++raised;
  return toast.custom(
    (toastId) => (
      <ToastCard
        key={key}
        level={level}
        message={message}
        action={action}
        onClose={() => toast.dismiss(toastId)}
      />
    ),
    { id, duration: Infinity },
  );
}

export const notify = {
  success: (message: string, options?: ToastOptions) => raise("success", message, options),
  info: (message: string, options?: ToastOptions) => raise("info", message, options),
  warning: (message: string, options?: ToastOptions) => raise("warning", message, options),
  error: (message: string, options?: ToastOptions) => raise("error", message, options),
  /** Closes one toast, or every toast when no id is given. */
  dismiss: (id?: string | number) => toast.dismiss(id),
};

import { X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "../../internal/cn";
import { LEVELS, LevelDisc, type Level } from "../../internal/levels";
import { Button, IconButton } from "../../primitives";

/**
 * The toast card of ADR 0042: a level, one sentence, at most one action and a
 * close button, plus the clock that closes it.
 *
 * The clock is ours: sonner's runs forever, and the card closes itself.
 * Sonner pauses its own clock on hover and in a hidden tab but not on
 * keyboard focus, so a Tab onto the undo left it running out.
 */

export type ToastLevel = Level;

export type ToastAction = { label: string; onClick: () => void; icon?: LucideIcon };

/** How long a toast stays, or null when it stays until closed. */
export function durationOf(level: ToastLevel, action?: ToastAction): number | null {
  if (level === "warning" || level === "error") return null;
  return action ? 10_000 : 5_000;
}

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

export type ToastCardProps = {
  level: ToastLevel;
  message: string;
  action?: ToastAction;
  onClose: () => void;
  /** The close button's accessible name, in the page's language. */
  closeLabel: string;
  /**
   * For a story or a catalogue only: the share of the time left, drawn and
   * never run, so a screenshot shows the column part-empty.
   */
  frozenAt?: number;
};

/**
 * The card itself, which `raiseToast` hands to sonner and a story renders as is.
 *
 * It sets its own width: sonner sizes only the toasts it styles, and leaves a
 * custom one as wide as its text. Up to 600px sonner stretches every toast
 * across the screen, and the card fills it.
 */
export function ToastCard({
  level,
  message,
  action,
  onClose,
  closeLabel,
  frozenAt,
}: ToastCardProps) {
  const { fill, tint } = LEVELS[level];
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
      className="grid min-h-18 w-full animate-toast-in min-[601px]:w-(--width) grid-cols-[3.875rem_1fr_auto] items-center gap-3 overflow-hidden rounded-lg border-3 border-ink bg-panel pr-2 font-sans text-base text-ink shadow-overlay"
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
        <LevelDisc level={level} size="lg" />
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
        <IconButton type="button" variant="quiet" icon={X} label={closeLabel} onClick={onClose} />
      </div>
    </div>
  );
}

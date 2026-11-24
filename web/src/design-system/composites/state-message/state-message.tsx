import { useState, type ReactNode } from "react";

import { Button, Surface } from "../../primitives";
import { Notice } from "../notice";

type Loading = {
  state: "loading";
  /** Shown above the rows and announced: "Chargement…". */
  label: string;
  /** How many rows the skeleton draws. */
  rows?: number;
  /**
   * Each row's height in rem, the height of the list item it stands in for, so
   * the page does not jump when the list arrives.
   */
  rowHeight?: number;
};

type Empty = {
  state: "empty";
  title: ReactNode;
  description?: ReactNode;
  /** The next step, such as a link to add the first item. */
  action?: ReactNode;
};

type Failed = {
  state: "error";
  title: ReactNode;
  description?: ReactNode;
  /**
   * Every error offers a way out. `busy` is the retry in flight (React
   * Query's `isFetching`): the button shows it and ignores clicks.
   */
  retry: { label: string; onRetry: () => void; busy?: boolean };
};

export type StateMessageProps = (Loading | Empty | Failed) & { className?: string };

/**
 * Says what state a region is in, loading, empty or failed, and offers the
 * next step (#387). It fetches nothing: the caller maps its query's state onto
 * `state`, and keeps rendering the same StateMessage while that changes.
 *
 * The status region is mounted in every state, empty when not loading, so a
 * load that starts again is heard: a live region announces what is added to
 * it, not a region that mounts with its text already in it.
 *
 * The error is the inline notice at its error level (ADR 0042), so it is the
 * red of a field error, plus a Réessayer. The caller keeps the error on
 * screen with `retry.busy` while a retry runs, even where React Query has gone
 * back to pending, so the focus a click put on the button stays there. Nothing
 * takes the reader's focus when an error first arrives.
 */
export function StateMessage(props: StateMessageProps) {
  const busy = props.state === "error" && props.retry.busy === true;
  const attempt = useAttempt(busy);

  return (
    <div data-state-message={props.state} className={props.className}>
      <p role="status" className={props.state === "loading" ? "text-ink-muted" : "sr-only"}>
        {props.state === "loading" ? props.label : null}
      </p>

      {props.state === "loading" ? (
        // Skeleton rows are a picture of what is coming and say nothing a
        // screen reader needs. A light frame, not the list's ink edge, or a
        // tall row reads as an empty card. motion-safe, not the global
        // reduced-motion rule in styles.css: that shortens an infinite pulse
        // into a flicker.
        <div aria-hidden="true" className="mt-tight grid gap-related">
          {Array.from({ length: props.rows ?? 3 }, (_, index) => (
            <Surface
              key={index}
              data-skeleton-row=""
              className="flex flex-col justify-between border-line motion-safe:animate-pulse"
              style={{ height: `${props.rowHeight ?? 5}rem` }}
            >
              <div>
                <div className="h-3 w-2/5 rounded-full bg-line" />
                <div className="mt-related h-3 w-3/4 rounded-full bg-line" />
                <div className="mt-tight h-3 w-1/2 rounded-full bg-line" />
              </div>
              <div className="h-3 w-1/3 rounded-full bg-line" />
            </Surface>
          ))}
        </div>
      ) : null}

      {props.state === "empty" ? (
        <Surface
          variant="placeholder"
          className="flex flex-wrap items-center justify-between gap-related"
        >
          <div>
            <p className="font-bold">{props.title}</p>
            {props.description ? (
              <p className="mt-tight text-ink-muted">{props.description}</p>
            ) : null}
          </div>
          {props.action ?? null}
        </Surface>
      ) : null}

      {props.state === "error" ? (
        <Notice level="error">
          <div className="flex flex-wrap items-center justify-between gap-related">
            <div role="alert">
              {/* Keyed by attempt, so a second failure puts the same words
                  back into the region and they are heard again. */}
              <div key={attempt}>
                <p className="font-bold">{props.title}</p>
                {props.description ? (
                  <p className="mt-tight text-ink-muted">{props.description}</p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={props.retry.onRetry}
            >
              {props.retry.label}
            </Button>
          </div>
        </Notice>
      ) : null}
    </div>
  );
}

/**
 * Counts the retries that have finished, from `busy` turning back off. Set
 * during render, so the new key lands in the same commit as the error.
 */
function useAttempt(busy: boolean) {
  const [seen, setSeen] = useState({ busy, attempt: 0 });
  if (seen.busy !== busy) {
    setSeen({ busy, attempt: seen.busy ? seen.attempt + 1 : seen.attempt });
  }
  return seen.attempt;
}

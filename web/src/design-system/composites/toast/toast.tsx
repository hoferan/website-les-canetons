import { useSyncExternalStore } from "react";

import { ToastCard, type ToastAction, type ToastLevel } from "./toast-card";

/**
 * The toast stack, sonner's adapter (ADR 0042, ADR 0046). The app raises a
 * toast through its own `notify`, which adds the translated close label;
 * nothing else calls sonner's `toast`, which an ESLint rule enforces.
 *
 * Sonner stacks, swipes and announces the toasts, and replaces one by id. The
 * card (./toast-card.tsx) draws the toast and runs its clock.
 */

export type ToastOptions = {
  /** Raising a toast under the id of one on screen replaces it. */
  id?: string;
  action?: ToastAction;
  /** The close button's accessible name, in the page's language. */
  closeLabel: string;
};

type Sonner = typeof import("sonner");
type ToasterComponent = typeof import("./toaster").Toaster;

/**
 * Sonner and the stack it draws, fetched by the first toast (#476), or ahead
 * of it by `loadToasts`. The app calls that once a member is logged in: only
 * members raise toasts, so a visitor never downloads them.
 */
let sonner: Sonner | undefined;
let Toaster: ToasterComponent | undefined;
let loading: Promise<Sonner> | undefined;

/** Whether a toast has been raised, which is when `ToastOutlet` mounts the stack. */
let wanted = false;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

/** Fetches sonner and the stack. The app does for a member; tests do up front. */
export function loadToasts(): Promise<Sonner> {
  loading ??= Promise.all([import("sonner"), import("./toaster")]).then(([module, stack]) => {
    sonner = module;
    Toaster = stack.Toaster;
    changed();
    return module;
  });
  return loading;
}

/** Runs at once when sonner is in, else once it is. */
function withSonner(run: (module: Sonner) => void) {
  if (sonner) run(sonner);
  else void loadToasts().then(run);
}

function want() {
  if (wanted) return;
  wanted = true;
  changed();
}

/**
 * Where the toasts stack, rendered once by the app. It draws nothing until the
 * first toast. Sonner replays the toasts raised before its stack subscribed,
 * so a toast raised while it loads is not lost.
 */
export function ToastOutlet() {
  const Stack = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => (wanted ? Toaster : undefined),
    () => undefined,
  );
  return Stack ? <Stack /> : null;
}

/**
 * A fresh key for every raise. A toast raised under the id of one on screen
 * replaces it in place, and without a new key React would keep the old card,
 * clock and all.
 */
let raised = 0;

/** Raises a toast and returns its id, which `dismissToast` takes. */
export function raiseToast(
  level: ToastLevel,
  message: string,
  { id, action, closeLabel }: ToastOptions,
): string {
  const key = ++raised;
  // Ours rather than sonner's, which only exists once sonner has loaded.
  const toastId = id ?? `toast-${key}`;
  want();
  withSonner(({ toast }) =>
    toast.custom(
      () => (
        <ToastCard
          key={key}
          level={level}
          message={message}
          action={action}
          closeLabel={closeLabel}
          onClose={() => toast.dismiss(toastId)}
        />
      ),
      { id: toastId, duration: Infinity },
    ),
  );
  return toastId;
}

/**
 * Closes one toast, or every toast when no id is given. Before the first
 * toast there is nothing to close, and nothing to fetch.
 */
export function dismissToast(id?: string | number) {
  if (loading) withSonner(({ toast }) => toast.dismiss(id));
}

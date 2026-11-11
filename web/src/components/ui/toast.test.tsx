import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { Toaster } from "./sonner";
import { notify } from "./toast";

/**
 * The clock of ADR 0042: success and info go after 5 s, anything with an
 * action after 10 s, and warnings and errors stay until closed. The clock
 * pauses on hover, on keyboard focus and while the tab is hidden.
 *
 * Fake timers include requestAnimationFrame and performance, which drive the
 * clock, and setTimeout, which sonner uses to unmount a dismissed toast.
 */
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
      "Date",
    ],
  });
  render(<Toaster />);
});

afterEach(() => {
  act(() => {
    notify.dismiss();
  });
  advance(1000);
  setHidden(false);
  vi.useRealTimers();
});

/**
 * In steps, each in its own act(). React runs effects only when an act()
 * ends, and sonner schedules a dismissed toast's unmount from an effect, so
 * one long jump would pass that timer before it exists.
 */
function advance(ms: number) {
  for (let done = 0; done < ms; done += 50) {
    act(() => {
      vi.advanceTimersByTime(Math.min(50, ms - done));
    });
  }
}

function raise(fn: () => void) {
  act(fn);
  // Sonner mounts a toast a tick after it is raised.
  advance(50);
}

/** The toast carrying this sentence, or null once it is gone. */
function toastSaying(sentence: string): HTMLElement | null {
  return screen.queryByText(sentence)?.closest<HTMLElement>("[data-sonner-toast]") ?? null;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test("a success with no action goes after 5 s, not before", () => {
  raise(() => notify.success("Texte enregistré."));
  advance(4500);
  expect(toastSaying("Texte enregistré.")).not.toBeNull();
  advance(1000);
  expect(toastSaying("Texte enregistré.")).toBeNull();
});

test("an info with no action goes after 5 s too", () => {
  raise(() => notify.info("Page rechargée."));
  advance(5500);
  expect(toastSaying("Page rechargée.")).toBeNull();
});

test("a toast with an action goes after 10 s, not after 5", () => {
  raise(() =>
    notify.success("Modifié", { action: { label: "Annuler", onClick: () => undefined } }),
  );
  advance(9000);
  expect(toastSaying("Modifié")).not.toBeNull();
  advance(1500);
  expect(toastSaying("Modifié")).toBeNull();
});

test.each(["warning", "error"] as const)("a %s stays until it is closed", (level) => {
  raise(() => notify[level]("Quelque chose a mal tourné."));
  advance(120_000);
  const toast = toastSaying("Quelque chose a mal tourné.");
  expect(toast).not.toBeNull();
  // Its column stays full: there is no clock to show.
  expect(toast!.querySelector("[data-toast-clock]")).toBeNull();

  act(() => {
    within(toast!).getByRole("button", { name: "Fermer" }).click();
  });
  advance(1000);
  expect(toastSaying("Quelque chose a mal tourné.")).toBeNull();
});

test("the pointer over a toast pauses its clock, and leaving resumes it", () => {
  raise(() => notify.success("Texte enregistré."));
  advance(3000);
  const card = toastSaying("Texte enregistré.")!.querySelector("[data-toast-level]")!;

  fireEvent.pointerEnter(card);
  advance(30_000);
  expect(toastSaying("Texte enregistré.")).not.toBeNull();

  fireEvent.pointerLeave(card);
  advance(1500);
  expect(toastSaying("Texte enregistré.")).not.toBeNull();
  advance(1000);
  expect(toastSaying("Texte enregistré.")).toBeNull();
});

test("keyboard focus inside a toast pauses its clock, which sonner alone does not", () => {
  raise(() =>
    notify.success("Modifié", { action: { label: "Annuler", onClick: () => undefined } }),
  );
  advance(8000);
  const undo = within(toastSaying("Modifié")!).getByRole("button", { name: "Annuler" });

  act(() => undo.focus());
  advance(60_000);
  expect(toastSaying("Modifié")).not.toBeNull();

  act(() => undo.blur());
  advance(1500);
  expect(toastSaying("Modifié")).not.toBeNull();
  advance(1000);
  expect(toastSaying("Modifié")).toBeNull();
});

test("a hidden tab pauses the clock", () => {
  raise(() => notify.success("Texte enregistré."));
  advance(2000);

  setHidden(true);
  advance(60_000);
  expect(toastSaying("Texte enregistré.")).not.toBeNull();

  setHidden(false);
  advance(2500);
  expect(toastSaying("Texte enregistré.")).not.toBeNull();
  advance(1000);
  expect(toastSaying("Texte enregistré.")).toBeNull();
});

test("the column empties as the time runs out", () => {
  raise(() => notify.success("Texte enregistré."));
  const clock = toastSaying("Texte enregistré.")!.querySelector<HTMLElement>("[data-toast-clock]")!;
  expect(parseFloat(clock.style.height)).toBeGreaterThan(98);
  advance(2500);
  // Half of the five seconds, plus the tick raise() waited for.
  expect(parseFloat(clock.style.height)).toBeCloseTo(49, 0);
});

test("the action runs once and closes the toast", () => {
  const onClick = vi.fn();
  raise(() => notify.success("Modifié", { action: { label: "Annuler", onClick } }));

  act(() => {
    within(toastSaying("Modifié")!).getByRole("button", { name: "Annuler" }).click();
  });
  advance(1000);
  expect(onClick).toHaveBeenCalledTimes(1);
  expect(toastSaying("Modifié")).toBeNull();
});

test("a toast raised under the id of one on screen replaces it and starts a fresh clock", () => {
  const action = { label: "Annuler", onClick: () => undefined };
  raise(() => notify.success("Premier.", { id: "saved", action }));
  advance(8000);
  raise(() => notify.success("Second.", { id: "saved", action }));

  expect(toastSaying("Premier.")).toBeNull();
  advance(8000);
  expect(toastSaying("Second.")).not.toBeNull();
  advance(2500);
  expect(toastSaying("Second.")).toBeNull();
});

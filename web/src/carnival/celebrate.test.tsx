import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { celebrate } from "./celebrate";

/**
 * jsdom implements neither the Web Animations API nor matchMedia, so both are
 * stubbed. Each animation finishes when the test says so, which is what lets
 * the clean-up be observed at all.
 */
let finish: () => void;
let animate: ReturnType<typeof vi.fn>;

function preferReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({ matches: reduce && query.includes("reduce") })),
  );
}

beforeEach(() => {
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  animate = vi.fn(() => ({ finished, cancel: vi.fn() }));
  Element.prototype.animate = animate as unknown as Element["animate"];
  preferReducedMotion(false);
});

afterEach(() => {
  // @ts-expect-error -- jsdom has no animate(); put it back the way it was.
  delete Element.prototype.animate;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function overlay() {
  return document.querySelector("[data-testid=celebration]");
}

test("throws confetti over the page, out of the way of the pointer and of screen readers", async () => {
  celebrate();

  await vi.waitFor(() => expect(overlay()?.querySelectorAll("svg").length).toBeGreaterThan(50));
  expect(overlay()).toHaveAttribute("aria-hidden", "true");
  expect(overlay()).toHaveClass("pointer-events-none", "fixed");
  expect(animate).toHaveBeenCalled();
});

test("takes its confetti away again once every piece has landed", async () => {
  celebrate();
  await vi.waitFor(() => expect(animate).toHaveBeenCalled());

  finish();

  await vi.waitFor(() => expect(overlay()).toBeNull());
});

test("throws nothing for somebody who asked for less motion", async () => {
  preferReducedMotion(true);

  celebrate();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(overlay()).toBeNull();
  expect(animate).not.toHaveBeenCalled();
});

test("throws nothing in a browser without the Web Animations API", async () => {
  // @ts-expect-error -- as in an old browser.
  delete Element.prototype.animate;

  celebrate();
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(overlay()).toBeNull();
});

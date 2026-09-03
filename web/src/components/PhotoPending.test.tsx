import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { PhotoPending } from "./PhotoPending";

// `what` completes the sentence, so a placeholder always names what is missing.
// A single shared string would read wrong under half the headings it appears
// beneath, and this is what Canetons.test.tsx leans on to catch a label landing
// under the wrong register.
test("it names the photograph that is missing", () => {
  render(<PhotoPending what="des trompettes" />);

  expect(screen.getByText(/Nouvelle photo des trompettes à venir/)).toBeInTheDocument();
});

// `grep -rl "<PhotoPending" web/src/pages` is the to-do list, and this attribute
// is how a rendered page is checked for the same thing.
test("it keeps the data-photo-pending hook, carrying what is awaited", () => {
  const { container } = render(<PhotoPending what="des cloches" />);

  expect(container.querySelector("[data-photo-pending]")).toHaveAttribute(
    "data-photo-pending",
    "des cloches",
  );
});

// E2a's decision, and the one thing about this component that is worth pinning
// in a test: an ABSENT photograph may not cost what a present one would. It was
// a 160px-minimum box, and eight of them were 42% of /canetons. This asserts on
// classes because that is where the height lives -- the honest check is looking
// at the page at 390px, and this is the regression fence around it.
test("an absence does not reserve a photograph's worth of height", () => {
  const { container } = render(<PhotoPending what="des batteurs" />);
  const className = container.querySelector("[data-photo-pending]")!.className;

  expect(className).not.toMatch(/\bmin-h-/);
  expect(className).not.toMatch(/\baspect-/);
  // Still visibly a placeholder rather than ordinary copy.
  expect(className).toMatch(/border-dashed/);
});

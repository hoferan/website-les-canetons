import { expect, test } from "vitest";

import { buttonVariants } from "./button";

const FRAMED = ["primary", "secondary", "danger", "accent"] as const;
const ALL = [...FRAMED, "quiet"] as const;

test.each(FRAMED)("%s hovers to a solid colour, never an alpha one", (variant) => {
  const hover = buttonVariants({ variant })
    .split(" ")
    .filter((name) => name.startsWith("hover:bg-"));
  expect(hover).toHaveLength(1);
  // A see-through hover lets a yellow page show through a yellow button.
  expect(hover[0]).not.toContain("/");
});

test.each(ALL)("%s has the hand cursor", (variant) => {
  expect(buttonVariants({ variant }).split(" ")).toContain("cursor-pointer");
});

test.each(FRAMED)("%s presses in onto its shadow", (variant) => {
  const classes = buttonVariants({ variant }).split(" ");
  expect(classes).toContain("active:translate-x-0.5");
  expect(classes).toContain("active:translate-y-0.5");
  expect(classes).toContain("active:shadow-raised-pressed");
  expect(classes).not.toContain("active:scale-[0.98]");
});

test("a stage button keeps a pink shadow when pressed", () => {
  const classes = buttonVariants({ variant: "accent", surface: "stage" }).split(" ");
  expect(classes).toContain("shadow-raised-stage");
  expect(classes).toContain("active:translate-x-[3px]");
  expect(classes).toContain("active:translate-y-[3px]");
  expect(classes).toContain("active:shadow-raised-stage-pressed");
  expect(classes).toContain("focus-ring-stage");
  expect(classes).not.toContain("shadow-raised-sm");
  expect(classes).not.toContain("active:shadow-raised-pressed");
});

// The press itself is CSS (press-quiet in styles.css), measured in a browser
// by e2e/quiet-press.spec.ts. Here: the class is there and nothing in the
// variant moves the button on its own, which would carry the line along.
test("quiet presses onto its line", () => {
  const classes = buttonVariants({ variant: "quiet" }).split(" ");
  expect(classes).toContain("press-quiet");
  expect(classes).toContain("relative");
  expect(classes.some((name) => name.startsWith("active:translate"))).toBe(false);
});

test.each(FRAMED)("%s has the button radius", (variant) => {
  expect(buttonVariants({ variant }).split(" ")).toContain("rounded-button");
});

test("the default is primary", () => {
  expect(buttonVariants({})).toBe(buttonVariants({ variant: "primary" }));
});

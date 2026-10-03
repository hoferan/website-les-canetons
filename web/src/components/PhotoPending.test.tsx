import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { PhotoPending, PhotoReserved } from "./PhotoPending";

/**
 * The reserved frame stands in for the placeholder until the page knows which
 * one it needs. jsdom has no layout, so "the same height" is pinned as "the
 * same classes": the box is sized by them alone (3:2, full column width).
 */
test("the reserved frame is the same box as the placeholder", () => {
  const { container } = render(
    <>
      <PhotoPending token="band" />
      <PhotoReserved />
    </>,
  );

  const pending = container.querySelector("[data-photo-pending]");
  const reserved = container.querySelector("[data-photo-reserved]");

  expect(pending?.className).toBeTruthy();
  expect(reserved?.className).toBe(pending?.className);
  expect(reserved?.className).toContain("aspect-[3/2]");
});

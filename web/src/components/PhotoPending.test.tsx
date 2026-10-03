import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { PhotoPending, PhotoReserved } from "./PhotoPending";

test("a visitor's placeholder is one line, while the frame reserved during loading is photo-shaped", () => {
  const { container } = render(
    <>
      <PhotoPending token="band" />
      <PhotoReserved />
    </>,
  );

  const pending = container.querySelector("[data-photo-pending]");
  const reserved = container.querySelector("[data-photo-reserved]");

  expect(pending?.tagName).toBe("P");
  expect(pending?.className).not.toContain("aspect-");
  expect(pending).toHaveTextContent("Photo à venir");
  expect(reserved?.className).toContain("aspect-[3/2]");
  expect(reserved).toHaveAttribute("aria-hidden", "true");
});

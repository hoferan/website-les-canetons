import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import { setMockUserWithPermissions } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { PhotoPending, PhotoReserved } from "./PhotoPending";

test("a visitor gets no placeholder, while the frame reserved during loading is photo-shaped", () => {
  const { container } = render(
    <MemoryRouter>
      <PhotoPending token="band" />
      <PhotoReserved />
    </MemoryRouter>,
  );

  const reserved = container.querySelector("[data-photo-reserved]");

  expect(container.querySelector("[data-photo-pending]")).toBeNull();
  expect(container).not.toHaveTextContent("Photo à venir");
  expect(reserved?.className).toContain("aspect-[3/2]");
  expect(reserved).toHaveAttribute("aria-hidden", "true");
});

/** Changing the page but not its photos, so no add frame takes its place. */
test("in edit mode the placeholder is one line, not a photo-sized box", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUserWithPermissions("demo.direction", ["content.manage"]);
  await renderWithSession(<PhotoPending token="band" />, { route: "/band" });

  const pending = (await screen.findByText("Photo à venir")).closest("[data-photo-pending]");

  expect(pending?.tagName).toBe("P");
  expect(pending?.className).not.toContain("aspect-");
});

import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { Band } from "../pages/Band";
import { renderWithSession } from "../test/renderWithSession";
import { EDIT_MODE_KEY, EditModeBar } from "./EditMode";

const editButton = () => screen.queryByRole("button", { name: "Modifier la page" });

test("the switch is offered to whoever may change the page", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditModeBar />, { route: "/join" });

  expect(editButton()).toBeInTheDocument();
});

test("a plain member and a visitor are offered no switch", async () => {
  setMockUser("demo.player");
  const { unmount } = await renderWithSession(<EditModeBar />, { route: "/join" });
  expect(editButton()).toBeNull();
  unmount();

  setMockUser(null);
  await renderWithSession(<EditModeBar />, { route: "/join" });
  expect(editButton()).toBeNull();
});

test("the switch is offered only on the public pages, where there is something to change", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditModeBar />, { route: "/members" });

  expect(editButton()).toBeNull();
});

test("turning it on shows the bar, and Terminer turns it off", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModeBar />, { route: "/join" });

  await user.click(editButton()!);
  const bar = screen.getByRole("region", { name: "Mode édition" });
  expect(sessionStorage.getItem(EDIT_MODE_KEY)).toBe("1");

  await user.click(within(bar).getByRole("button", { name: "Terminer" }));
  expect(screen.queryByRole("region", { name: "Mode édition" })).toBeNull();
  expect(editButton()).toBeInTheDocument();
});

test("edit mode survives a reload of the tab", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<EditModeBar />, { route: "/join" });

  expect(screen.getByRole("region", { name: "Mode édition" })).toBeInTheDocument();
});

test("storage that throws leaves edit mode off and the page working", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModeBar />, { route: "/join" });

  await user.click(editButton()!);
  expect(screen.getByRole("region", { name: "Mode édition" })).toBeInTheDocument();
});

test("with edit mode off, a photo manager sees the visitor's page", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band" });

  await screen.findAllByText("Photo à venir");
  expect(document.querySelector("[data-photo-pending='godparents']")).not.toBeNull();
  expect(screen.queryByRole("button", { name: /Ajouter une photo/ })).toBeNull();
});

test("with edit mode on, the photo controls appear", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band" });

  expect(
    (await screen.findAllByRole("button", { name: /Ajouter une photo/ })).length,
  ).toBeGreaterThan(0);
});

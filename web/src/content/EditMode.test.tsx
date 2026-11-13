import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { setMockUser, setMockUserWithPermissions } from "../mocks/handlers";
import { History } from "../pages/History";
import { Band } from "../pages/Band";
import { renderWithSession } from "../test/renderWithSession";
import { EDIT_MODE_KEY, EditModePill } from "./EditMode";

const editButton = () => screen.queryByRole("button", { name: "Modifier la page" });
const doneButton = () => screen.queryByRole("button", { name: "Terminer la modification" });

test("the switch is offered to whoever may change the page", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/join" });

  expect(editButton()).toBeInTheDocument();
});

test("a plain member and a visitor are offered no switch", async () => {
  setMockUser("demo.player");
  const { unmount } = await renderWithSession(<EditModePill />, { route: "/join" });
  expect(editButton()).toBeNull();
  unmount();

  setMockUser(null);
  await renderWithSession(<EditModePill />, { route: "/join" });
  expect(editButton()).toBeNull();
});

test("the switch is offered only on the public pages, where there is something to change", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/members" });

  expect(editButton()).toBeNull();
});

test("turning it on relabels the pill, and Terminer turns it off", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/join" });

  await user.click(editButton()!);
  expect(doneButton()).toBeInTheDocument();
  expect(sessionStorage.getItem(EDIT_MODE_KEY)).toBe("1");

  await user.click(doneButton()!);
  expect(doneButton()).toBeNull();
  expect(editButton()).toBeInTheDocument();
  expect(sessionStorage.getItem(EDIT_MODE_KEY)).toBeNull();
});

test("edit mode survives a reload of the tab", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/join" });

  expect(doneButton()).toBeInTheDocument();
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
  await renderWithSession(<EditModePill />, { route: "/join" });

  await user.click(editButton()!);
  expect(doneButton()).toBeInTheDocument();
});

test("on an admin page edit mode is off even when switched on, and the pill is absent", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/members" });

  expect(editButton()).toBeNull();
  expect(doneButton()).toBeNull();
});

test("toggling keeps focus on the pill and announces the mode", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/join" });

  const pill = editButton()!;
  expect(pill.className).toContain("min-h-touch");
  await user.click(pill);
  expect(doneButton()).toBe(pill);
  expect(pill).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Mode édition activé");

  await user.click(pill);
  expect(editButton()).toBe(pill);
  expect(pill).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Mode édition désactivé.");
});

test("with edit mode off, a photo manager sees the visitor's page", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band" });

  await screen.findAllByText("Photo à venir");
  expect(
    document.querySelector("[data-photo-pending='band.godparents.godparents']"),
  ).not.toBeNull();
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

test("the switch sits in a stage bar docked across the bottom, with the stage's button look", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModePill />, { route: "/join" });

  // The bar spans the screen, so the page passes behind it as it does behind
  // the screen's edge, never under a floating button (edit-pill.spec.ts).
  const bar = (button: HTMLElement) => button.closest(".fixed")!;
  expect(bar(editButton()!).className.split(" ")).toEqual(
    expect.arrayContaining(["inset-x-0", "bottom-0", "bg-stage"]),
  );
  const stageLook = (button: HTMLElement | null) => {
    expect(button).toHaveAttribute("data-variant", "accent");
    expect(button).toHaveAttribute("data-surface", "stage");
  };
  stageLook(editButton());
  await user.click(editButton()!);
  stageLook(doneButton());
});

test("a history.manage-only account gets the switch and the history controls, but no block chips", async () => {
  const user = userEvent.setup();
  setMockUserWithPermissions("demo.direction", ["history.manage"]);
  await renderWithSession(<EditModePill />, { route: "/join" });
  expect(editButton()).toBeInTheDocument();
  await user.click(editButton()!);
  expect(doneButton()).toBeInTheDocument();
  cleanup();

  await renderWithSession(<History />, { route: "/history" });
  expect(await screen.findByRole("link", { name: "Ajouter à l’histoire" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Modifier : / })).toBeNull();
});

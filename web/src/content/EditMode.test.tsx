import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { setMockUser, setMockUserWithPermissions } from "../mocks/handlers";
import { History } from "../pages/History";
import { Band } from "../pages/Band";
import { renderWithSession } from "../test/renderWithSession";
import { EDIT_MODE_KEY, EditModeAnnouncer, EditModeBar, EditModeStart } from "./EditMode";

/** The switch as Layout mounts it: the header's button, the bar and the live region. */
function EditModeSwitch() {
  return (
    <>
      <EditModeStart />
      <EditModeBar />
      <EditModeAnnouncer />
    </>
  );
}

const editButton = () => screen.queryByRole("button", { name: "Modifier la page" });
const doneButton = () => screen.queryByRole("button", { name: "Terminer la modification" });

test("the switch is offered to whoever may change the page", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

  expect(editButton()).toBeInTheDocument();
});

test("a plain member and a visitor are offered no switch", async () => {
  setMockUser("demo.player");
  const { unmount } = await renderWithSession(<EditModeSwitch />, { route: "/join" });
  expect(editButton()).toBeNull();
  unmount();

  setMockUser(null);
  await renderWithSession(<EditModeSwitch />, { route: "/join" });
  expect(editButton()).toBeNull();
});

test("the switch is offered only on the public pages, where there is something to change", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/members" });

  expect(editButton()).toBeNull();
});

test("turning it on swaps the header button for the bar, and Terminer turns it off", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

  await user.click(editButton()!);
  expect(doneButton()).toBeInTheDocument();
  expect(editButton()).toBeNull();
  expect(screen.getByText("Mode édition")).toBeInTheDocument();
  expect(sessionStorage.getItem(EDIT_MODE_KEY)).toBe("1");

  await user.click(doneButton()!);
  expect(screen.queryByText("Mode édition")).toBeNull();
  expect(doneButton()).toBeNull();
  expect(editButton()).toBeInTheDocument();
  expect(sessionStorage.getItem(EDIT_MODE_KEY)).toBeNull();
});

test("edit mode survives a reload of the tab", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

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
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

  await user.click(editButton()!);
  expect(doneButton()).toBeInTheDocument();
});

test("on an admin page edit mode is off even when switched on, and the pill is absent", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/members" });

  expect(editButton()).toBeNull();
  expect(doneButton()).toBeNull();
});

test("toggling hands focus to the button that replaced the one pressed, and announces the mode", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

  expect(editButton()!.className).toContain("min-h-touch");
  await user.click(editButton()!);
  expect(doneButton()).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Mode édition activé");

  await user.click(doneButton()!);
  expect(editButton()).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Mode édition désactivé.");
});

test("focus is left alone when the mode was not changed by its buttons", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

  // A reload with edit mode on mounts the bar; it must not steal focus.
  expect(doneButton()).not.toHaveFocus();
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

test("the header button has the stage look, and the bar sticks in the flow with a white button", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EditModeSwitch />, { route: "/join" });

  expect(editButton()).toHaveAttribute("data-variant", "accent");
  expect(editButton()).toHaveAttribute("data-surface", "stage");

  await user.click(editButton()!);
  // Sticky: in the flow at the top of the page it covers nothing, and once
  // stuck it hides the page the way the header does (edit-pill.spec.ts).
  const bar = doneButton()!.closest(".sticky")!;
  expect(bar.className.split(" ")).toEqual(
    expect.arrayContaining(["top-11", "md:top-0", "bg-yellow"]),
  );
  expect(doneButton()).toHaveAttribute("data-variant", "secondary");
  // Shows the short word; the name keeps the whole phrase, which starts with it.
  expect(doneButton()).toHaveTextContent(/^Terminer$/);
});

test("a history.manage-only account gets the switch and the history controls, but no block chips", async () => {
  const user = userEvent.setup();
  setMockUserWithPermissions("demo.direction", ["history.manage"]);
  await renderWithSession(<EditModeSwitch />, { route: "/join" });
  expect(editButton()).toBeInTheDocument();
  await user.click(editButton()!);
  expect(doneButton()).toBeInTheDocument();
  cleanup();

  await renderWithSession(<History />, { route: "/history" });
  expect(await screen.findByRole("link", { name: "Ajouter à l’histoire" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Modifier : / })).toBeNull();
});

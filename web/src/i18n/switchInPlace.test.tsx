import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import { setMockUser } from "../mocks/handlers";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

/**
 * The header's switch is a navigation inside the app (#369): the page stays
 * mounted, so what was typed stays, and only the language changes.
 */
test("switching language keeps the page and what was typed in it", async () => {
  const confirm = vi.spyOn(window, "confirm");
  await renderWithSession(<AppRoutes />, { route: "/contact" });
  await userEvent.type(await screen.findByRole("textbox", { name: /Prénom/ }), "Anna");
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});

  await userEvent.click(screen.getAllByRole("link", { name: "Auf Deutsch wechseln" })[0]!);

  expect(await screen.findByRole("heading", { level: 1, name: /Kontakt/ })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /Vorname/ })).toHaveValue("Anna");
  expect(document.documentElement.lang).toBe("de-CH");
  // The same page: no question about leaving it, and no jump to the top.
  expect(confirm).not.toHaveBeenCalled();
  expect(scrollTo).not.toHaveBeenCalled();

  await userEvent.click(screen.getAllByRole("link", { name: "Passer en français" })[0]!);

  expect(await screen.findByRole("heading", { level: 1, name: /Contact/ })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /Prénom/ })).toHaveValue("Anna");
  expect(document.documentElement.lang).toBe("fr-CH");
});

// What #368 builds on: the block editor is the page's preview, and stays open
// with what was typed in it when the page changes language.
test("an open block editor keeps what was typed across a change of language", async () => {
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  const { router } = await renderWithSession(<AppRoutes />, { route: "/join" });
  await userEvent.click(
    await screen.findByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }),
  );
  const title = within(await screen.findByRole("dialog")).getByRole("textbox", {
    name: "Titre FR",
  });
  await userEvent.clear(title);
  await userEvent.type(title, "Viens jouer");

  await act(() => router.navigate("/de/join"));

  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("textbox", { name: "Titel FR" })).toHaveValue("Viens jouer");
  expect(within(dialog).getByRole("button", { name: "Speichern" })).toBeInTheDocument();
});

test("a German URL renders the page in German, and its links stay German", async () => {
  await renderWithSession(<AppRoutes />, { route: "/de/join" });

  expect(
    await screen.findByRole("heading", { level: 1, name: /mit der Gugge anfangen/ }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Wo Sie uns sehen" })[0]).toHaveAttribute(
    "href",
    "/de/agenda",
  );
});

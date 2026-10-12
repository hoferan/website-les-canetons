import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Registers } from "./Registers";

/**
 * The register editor (#276). The mocked roster mirrors DevSeeder: Nadia in
 * Batteurs, which Bastien teaches; Perrine in Cloches, Bastien in
 * Trompettes, Camille in Trombones. Grosses-caisses and Lyre are empty.
 */
async function renderEditor() {
  setMockUser("demo.direction");
  await renderWithSession(<Registers />, { route: "/registers" });
  await screen.findAllByTestId("register-row");
}

function names(): string[] {
  return screen
    .getAllByTestId("register-row")
    .map((row) => row.querySelector("p.font-semibold")?.textContent ?? "");
}

function rowFor(name: string): HTMLElement {
  const row = screen
    .getAllByTestId("register-row")
    .find((candidate) => candidate.querySelector("p.font-semibold")?.textContent?.startsWith(name));
  if (!row) {
    throw new Error(`no row for "${name}"`);
  }
  return row;
}

/** A row's button by its exact accessible name; the guillemets carry no-break spaces. */
function button(action: string, name: string): HTMLElement {
  return screen.getByRole("button", { name: `${action} «\u00a0${name}\u00a0»` });
}

test("lists the registers in the band's order, with who plays in and teaches each", async () => {
  await renderEditor();

  expect(names()).toEqual([
    "Batteurs",
    "Grosses-caisses",
    "Lyre",
    "Cloches",
    "Trompettes",
    "Trombones",
  ]);
  expect(rowFor("Batteurs")).toHaveTextContent("1 musicien · 1 moniteur");
  expect(rowFor("Lyre")).toHaveTextContent("0 musicien · 0 moniteur");
});

test("gives a register a German name, shown beside the French one", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(button("Modifier", "Lyre"));
  // The open row's field comes before the new-register form's in the page.
  const [field] = await screen.findAllByLabelText("Nom en allemand");
  await user.type(field!, "Leier");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(names()).toContain("Lyre · Leier"));
});

test("moves a register up, and cannot move the first one further", async () => {
  const user = userEvent.setup();
  await renderEditor();

  expect(button("Monter", "Batteurs")).toHaveAttribute("aria-disabled", "true");
  await user.click(button("Monter", "Trombones"));

  await waitFor(() => expect(names().slice(-2)).toEqual(["Trombones", "Trompettes"]));
});

test("says so when somebody added or deleted a register while this one moved", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/sections/order", () =>
      HttpResponse.json(
        {
          title: "Conflict",
          status: 409,
          code: "registers_changed",
          instance: "/api/v1/sections/order",
          errors: [],
          requestId: "test",
          detail: "",
        },
        { status: 409 },
      ),
    ),
  );
  await renderEditor();

  await user.click(button("Descendre", "Batteurs"));

  expect(
    await screen.findByText(/a ajouté ou supprimé un pupitre entre-temps/),
  ).toBeInTheDocument();
});

test("does not offer to delete a register somebody plays in", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(button("Supprimer", "Cloches"));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("1 musicien et 0 moniteur");
  expect(within(dialog).getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
});

test("deletes an empty register", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(button("Supprimer", "Grosses-caisses"));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("Personne ne joue dans ce pupitre");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  await waitFor(() => expect(names()).not.toContain("Grosses-caisses"));
});

test("adds a register at the end", async () => {
  const user = userEvent.setup();
  await renderEditor();

  const form = screen.getByRole("form", { name: "Nouveau pupitre" });
  await user.type(within(form).getByLabelText(/Nom en français/), "Cuivres");
  await user.click(within(form).getByRole("button", { name: "Ajouter" }));

  await waitFor(() => expect(names().at(-1)).toBe("Cuivres"));
});

test("refuses a French name another register has", async () => {
  const user = userEvent.setup();
  await renderEditor();

  const form = screen.getByRole("form", { name: "Nouveau pupitre" });
  await user.type(within(form).getByLabelText(/Nom en français/), "Cloches");
  await user.click(within(form).getByRole("button", { name: "Ajouter" }));

  expect(await within(form).findByText(/déjà/)).toBeInTheDocument();
});

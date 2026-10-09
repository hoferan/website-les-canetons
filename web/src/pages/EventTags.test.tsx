import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { problem, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventTags } from "./EventTags";

async function renderEditor() {
  setMockUser("demo.direction");
  await renderWithSession(<EventTags />, { route: "/event-tags" });
  await screen.findAllByTestId("event-tag-row");
}

/** The row for the tag with this French name. */
function rowFor(labelFr: string): HTMLElement {
  const row = screen
    .getAllByTestId("event-tag-row")
    .find((candidate) => within(candidate).queryByText(labelFr) !== null);
  if (!row) {
    throw new Error(`no row for "${labelFr}"`);
  }
  return row;
}

/**
 * The confetti switch on a tag's row, by its exact accessible name. The name's
 * guillemets carry no-break spaces, and a role query's `name` is compared
 * without normalising them.
 */
function confettiSwitch(labelFr: string): HTMLElement {
  return screen.getByRole("switch", { name: `Confettis pour «\u00a0${labelFr}\u00a0»` });
}

test("lists every tag with how many events carry it", async () => {
  await renderEditor();

  expect(screen.getAllByTestId("event-tag-row")).toHaveLength(4);
  // Seeded: one event carries Concert, the draft "Concert d'automne".
  expect(within(rowFor("Concert")).getByText("1 événement")).toBeInTheDocument();
});

test("a new tag is added at the end of the list", async () => {
  const user = userEvent.setup();
  await renderEditor();

  const form = screen.getByRole("form", { name: "Nouvelle catégorie" });
  await user.type(within(form).getByLabelText("Nom en français"), "Souper");
  await user.type(within(form).getByLabelText("Nom en allemand"), "Abendessen");
  await user.click(within(form).getByRole("radio", { name: "Corail" }));
  await user.click(within(form).getByRole("button", { name: "Ajouter" }));

  await waitFor(() => expect(screen.getAllByTestId("event-tag-row")).toHaveLength(5));
  const rows = screen.getAllByTestId("event-tag-row");
  expect(within(rows[4] as HTMLElement).getByText("Souper")).toBeInTheDocument();
});

test("a taken French name is reported on its own field", async () => {
  const user = userEvent.setup();
  await renderEditor();

  const form = screen.getByRole("form", { name: "Nouvelle catégorie" });
  await user.type(within(form).getByLabelText("Nom en français"), "concert");
  await user.click(within(form).getByRole("button", { name: "Ajouter" }));

  expect(await within(form).findByText("Nom en français est déjà utilisé")).toBeInTheDocument();
  expect(screen.getAllByTestId("event-tag-row")).toHaveLength(4);
});

test("renaming a tag saves it", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(within(rowFor("Concert")).getByRole("button", { name: /^Modifier/ }));
  const field = await within(rowFor("Concert")).findByLabelText("Nom en français");
  await user.clear(field);
  await user.type(field, "Concerts");
  await user.click(within(rowFor("Concerts")).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() =>
    expect(within(rowFor("Concerts")).queryByLabelText("Nom en français")).toBeNull(),
  );
});

test("the confetti switch shows the stored flag and saves as it is flipped", async () => {
  const user = userEvent.setup();
  await renderEditor();

  // Seeded on Carnaval only.
  expect(confettiSwitch("Carnaval")).toBeChecked();
  const sortie = confettiSwitch("Sortie");
  expect(sortie).not.toBeChecked();

  // No "Enregistrer": the flip is the save. The fresh list read afterwards is
  // what proves the server has it.
  await user.click(sortie);
  await waitFor(() => expect(confettiSwitch("Sortie")).toBeChecked());
  await waitFor(() => expect(confettiSwitch("Sortie")).toHaveAttribute("aria-disabled", "false"));
  expect(confettiSwitch("Sortie")).toBeChecked();
  // The edit form has no copy of it.
  await user.click(within(rowFor("Sortie")).getByRole("button", { name: /^Modifier/ }));
  await within(rowFor("Sortie")).findByLabelText("Nom en français");
  expect(within(rowFor("Sortie")).queryByRole("switch")).toBeNull();
  expect(within(rowFor("Sortie")).queryByRole("checkbox")).toBeNull();
});

/**
 * MUTATION TEST: pass `disabled={busy}` again, alone or beside aria-disabled,
 * and `toBeEnabled()` fails. In a browser that attribute throws a keyboard
 * user's focus to <body> mid-save (rule 2 in ui/button.tsx), but jsdom keeps
 * the focus where it was, so the focus assertions here cannot see it;
 * tags.spec.ts shows it in Chromium. Drop the early return and the second
 * Space turns the switch off mid-save.
 */
test("a Space flip saves without disabling the switch, and ignores a second one", async () => {
  const user = userEvent.setup();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.put("/api/v1/event-tags/:id", async () => {
      await held;
      return problem(412, "if_match_failed", "The If-Match header does not match");
    }),
  );
  await renderEditor();

  confettiSwitch("Sortie").focus();
  await user.keyboard(" ");

  expect(confettiSwitch("Sortie")).toBeChecked();
  expect(confettiSwitch("Sortie")).toHaveAttribute("aria-disabled", "true");
  expect(confettiSwitch("Sortie")).toBeEnabled();
  expect(confettiSwitch("Sortie")).toHaveFocus();
  await user.keyboard(" ");
  expect(confettiSwitch("Sortie")).toBeChecked();

  release();

  await within(rowFor("Sortie")).findByRole("alert");
  expect(confettiSwitch("Sortie")).not.toBeChecked();
  expect(confettiSwitch("Sortie")).toHaveFocus();
});

test("a refused flip puts the switch back and says why", async () => {
  // MUTATION TEST: drop the reset in flip()'s finally and the switch stays on
  // over a refusal, showing a flag the server never stored.
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/event-tags/:id", () =>
      HttpResponse.json(
        {
          title: "Precondition Failed",
          status: 412,
          code: "if_match_failed",
          instance: "/api/v1/event-tags/3",
          errors: [],
          requestId: "test",
          detail: null,
        },
        { status: 412, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  await renderEditor();

  await user.click(confettiSwitch("Sortie"));

  await waitFor(() =>
    expect(within(rowFor("Sortie")).getByRole("alert")).toHaveTextContent(
      "Quelqu'un a modifié cet élément entre-temps.",
    ),
  );
  expect(confettiSwitch("Sortie")).not.toBeChecked();
});

test("a rename refused because somebody else changed the tag says so", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/event-tags/:id", () =>
      HttpResponse.json(
        {
          title: "Precondition Failed",
          status: 412,
          code: "if_match_failed",
          instance: "/api/v1/event-tags/2",
          errors: [],
          requestId: "test",
          detail: null,
        },
        { status: 412, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );
  await renderEditor();

  await user.click(within(rowFor("Concert")).getByRole("button", { name: /^Modifier/ }));
  await within(rowFor("Concert")).findByLabelText("Nom en français");
  await user.click(within(rowFor("Concert")).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() =>
    expect(within(rowFor("Concert")).getByRole("alert")).toHaveTextContent(
      "Quelqu'un a modifié cet élément entre-temps.",
    ),
  );
});

test("a German page names the tag in German in its controls and its dialog", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<EventTags />, { route: "/de/event-tags", locale: "de-CH" });
  await screen.findAllByTestId("event-tag-row");

  expect(screen.getByRole("button", { name: "«Konzert» bearbeiten" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "«Konzert» löschen" }));
  expect(await screen.findByRole("alertdialog")).toHaveTextContent("«Konzert» löschen?");
});

test("deleting a tag says how many events lose it, then removes it", async () => {
  const user = userEvent.setup();
  await renderEditor();

  await user.click(within(rowFor("Concert")).getByRole("button", { name: /^Supprimer/ }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent("1 événement");

  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
  await waitFor(() => expect(screen.getAllByTestId("event-tag-row")).toHaveLength(3));
  expect(screen.queryByText("Concert")).toBeNull();
});

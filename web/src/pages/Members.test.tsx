import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Members } from "./Members";

/**
 * Every assertion here depends on the roster having arrived, so the helper
 * waits for it rather than each test remembering to.
 */
async function renderRoster() {
  setMockUser("demo.direction");
  const result = await renderWithSession(<Members />, { route: "/members" });
  await screen.findAllByText("Sansconnexion");
  return result;
}

/**
 * BOTH LAYOUTS ARE ALWAYS IN THE DOM. Cards below md and a table above is a
 * Tailwind `hidden`/`md:block` pair — the browser picks one by viewport, and
 * jsdom applies no CSS, so every person appears twice here. That is the layout
 * working, not a bug, so the queries scope to one of them; `bothLayoutsAgree`
 * below is what checks the other still lists the same people.
 */
function table() {
  return within(screen.getByTestId("roster-table"));
}

function cards() {
  return within(screen.getByTestId("roster-cards"));
}

/** One person's row, in the table layout. */
function rowFor(lastName: string): HTMLElement {
  const row = table().getByText(lastName).closest("[data-member]");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row for ${lastName}`);
  }
  return row;
}

function lastNamesIn(scope: ReturnType<typeof within>): string[] {
  return scope
    .getAllByTestId("member-last-name")
    .map((cell: HTMLElement) => cell.textContent?.trim() ?? "");
}

test("lists everybody on the roster, ordered by name", async () => {
  await renderRoster();

  expect(lastNamesIn(table())).toEqual([
    "Both",
    "Committee",
    "Direction",
    "Player",
    "Sansconnexion",
  ]);
});

test("the heading counts the roster the server holds, not the rows on screen", async () => {
  // `meta.total` rather than members.length. The two agree today, and the
  // reason to read the server's number is that they would stop agreeing the
  // moment this list were ever cut short — at which point counting what
  // arrived would quietly under-report the band.
  await renderRoster();

  expect(screen.getByTestId("roster-count")).toHaveTextContent("5 membres");
});

test("the phone layout lists exactly the same people as the table", async () => {
  await renderRoster();

  // Both render from the same array in one pass and only their wrappers
  // differ, so they can never disagree about who is on the roster. This is
  // what says so: a future edit that adds a person to one and not the other
  // fails here rather than on somebody's phone.
  expect(lastNamesIn(cards())).toEqual(lastNamesIn(table()));
});

test("shows each person's register, and says plainly when they are in none", async () => {
  await renderRoster();

  expect(within(rowFor("Player")).getByText("Cloches")).toBeInTheDocument();
  // Dominique organises and does not play, so there is no register. A blank
  // cell reads as missing data; this is a fact about them.
  expect(within(rowFor("Direction")).getByText("Aucun pupitre")).toBeInTheDocument();
});

test("shows roles by their French label, never the key or the permissions", async () => {
  await renderRoster();

  const direction = rowFor("Direction");
  // "why does she have this?" is answered with "because she is in Team
  // Direction" (design §3) — never the key "direction", and never the raw
  // permission strings.
  expect(within(direction).getByText("Team Direction")).toBeInTheDocument();
  expect(direction.textContent).not.toContain("members.manage");

  expect(within(rowFor("Committee")).getByText("Comité")).toBeInTheDocument();
});

test("creates a person and shows them in the list", async () => {
  await renderRoster();

  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));
  await userEvent.type(screen.getByLabelText("Prénom"), "Lea");
  await userEvent.type(screen.getByLabelText("Nom"), "Nouvelle");
  await userEvent.type(screen.getByLabelText("Identifiant"), "lea.nouvelle");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await table().findByText("Nouvelle")).toBeInTheDocument();
});

test("shows the new person's password once, as text that can be read aloud", async () => {
  await renderRoster();

  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));
  await userEvent.type(screen.getByLabelText("Prénom"), "Lea");
  await userEvent.type(screen.getByLabelText("Nom"), "Nouvelle");
  await userEvent.type(screen.getByLabelText("Identifiant"), "lea.nouvelle");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // The fixed value the mock returns. Shown as TEXT — not in a password field,
  // which would defeat the entire point of a credential meant to be dictated.
  const shown = await screen.findByTestId("generated-password");
  expect(shown).toHaveTextContent("kanu-7rex-mp34");
  expect(shown.tagName).not.toBe("INPUT");
});

test("reports a taken username against its own field, in French", async () => {
  await renderRoster();

  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));
  await userEvent.type(screen.getByLabelText("Prénom"), "Autre");
  await userEvent.type(screen.getByLabelText("Nom"), "Personne");
  await userEvent.type(screen.getByLabelText("Identifiant"), "demo.player");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("Identifiant est déjà utilisé")).toBeInTheDocument();
  // The panel stays OPEN: a rejected username has to be corrected where it was
  // typed, and closing the form would throw away everything else too.
  expect(screen.getByLabelText("Prénom")).toHaveValue("Autre");
});

test("grants no roles on creation, and says why", async () => {
  await renderRoster();
  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));

  // The API refuses roleIds on create deliberately — granting a permission is
  // exactly one operation, and accepting it here would make the unguarded path
  // easier than the guarded one. An inert checkbox with no explanation is
  // worse than either, so the form says so.
  const role = screen.getByLabelText("Team Direction");
  expect(role).toBeDisabled();
  expect(screen.getByText(/après avoir enregistré/i)).toBeInTheDocument();
});

test("assigns a role to somebody who already exists", async () => {
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );
  await userEvent.click(screen.getByLabelText("Comité"));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await within(rowFor("Player")).findByText("Comité")).toBeInTheDocument();
});

test("changing a name and a role in one save does both", async () => {
  // THE CHAINED TAG. Roles travel on their own endpoint, so this save is two
  // conditional writes: the PATCH moves the member's tag, and the roles call
  // that follows has to quote the tag the PATCH handed BACK. Sending the one
  // the form opened with answers 412 and the role change is silently lost —
  // silently, because the name was already saved by then.
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );

  const lastName = await screen.findByLabelText("Nom", { exact: true });
  await userEvent.clear(lastName);
  await userEvent.type(lastName, "Joueuse");
  await userEvent.click(screen.getByLabelText("Comité"));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  const row = await table().findByText("Joueuse");
  const changed = row.closest("[data-member]");
  expect(changed).not.toBeNull();
  expect(within(changed as HTMLElement).getByText("Comité")).toBeInTheDocument();
});

test("refuses to save over a change somebody else made while the form was open", async () => {
  // THE WHOLE POINT OF A4, at the screen. Two administrators have the roster
  // open, one corrects a register while the other is typing a name, and before
  // this the second save discarded the first silently.
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );
  await screen.findByLabelText("Prénom", { exact: true });

  // Somebody else, through the same API. The mocked backend hands out a new
  // tag for the changed member, so the one this form is holding is now stale.
  const read = await fetch("/api/v1/members/2");
  await fetch("/api/v1/members/2", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "If-Match": read.headers.get("ETag") ?? "",
    },
    body: JSON.stringify({ committeeTitle: "Caissière" }),
  });

  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // In French, from the `if_match_failed` token — and the form stays open, so
  // the typing is not thrown away along with the save.
  expect(await screen.findByText(/modifié cet élément entre-temps/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
});

test("names the person and the consequence before deleting them", async () => {
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Supprimer Perrine Player" }),
  );

  // "Êtes-vous sûr ?" is a question nobody reads. The name is what makes the
  // dialog worth stopping for.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining("Perrine Player"));
  expect(within(dialog).getByText(/accès au site/i)).toBeInTheDocument();
});

test("requires the person's name to be typed before deleting", async () => {
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Supprimer Perrine Player" }),
  );
  const dialog = await screen.findByRole("alertdialog");

  // Decision B7: the server no longer re-authenticates a delete, so this typed
  // confirmation is the ONLY guard against a mis-aimed tap. Pressing the button
  // with the box empty must do nothing at all.
  await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(rowFor("Player")).toBeInTheDocument();
});

test("deletes the person once their name is typed", async () => {
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Supprimer Perrine Player" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.type(within(dialog).getByLabelText(/Perrine Player/), "Perrine Player");
  await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  expect(await table().findByText("Both")).toBeInTheDocument();
  expect(table().queryByText("Player")).toBeNull();
});

test("keeps the person and explains, when the server refuses", async () => {
  await renderRoster();

  await userEvent.click(
    within(rowFor("Direction")).getByRole("button", { name: "Supprimer Dominique Direction" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.type(within(dialog).getByLabelText(/Dominique Direction/), "Dominique Direction");
  await userEvent.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  // The API's cannot_delete_self, translated. The UI does NOT pre-empt this:
  // the server owns the invariant and the screen reports what it says, because
  // a duplicated rule drifts and then the two disagree in front of somebody
  // trying to fix a lockout.
  expect(
    await screen.findByText("Vous ne pouvez pas supprimer votre propre compte."),
  ).toBeInTheDocument();
  // Dialog stays open, so the refusal is read where the action was taken.
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(rowFor("Direction")).toBeInTheDocument();
});

test("issues a replacement password and shows it once", async () => {
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", {
      name: "Réinitialiser le mot de passe de Perrine Player",
    }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Réinitialiser" }));

  expect(await screen.findByTestId("generated-password")).toHaveTextContent("kanu-7rex-mp34");
});

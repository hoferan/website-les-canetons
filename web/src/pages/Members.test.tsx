import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMemberRoles, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Members } from "./Members";

/** Renders the roster and waits for it to arrive. */
async function renderRoster(locale: Locale = "fr") {
  setMockUser("demo.direction");
  const result = await renderWithSession(<Members />, { route: "/members", locale });
  await screen.findAllByText("Sansconnexion");
  return result;
}

/** The roster's cards, the one layout at every width. */
function cards() {
  return within(screen.getByTestId("roster-cards"));
}

/** One person's card. */
function rowFor(lastName: string): HTMLElement {
  const row = cards().getByText(lastName).closest("[data-member]");
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

/**
 * Opens one person's overflow menu and returns it, so `Mot de passe` and
 * `Supprimer` can be queried inside.
 *
 * Takes the trigger's whole accessible name, so the German tests below can
 * open the same menu by its German name.
 */
async function openMenuFor(
  user: ReturnType<typeof userEvent.setup>,
  triggerName: string,
): Promise<HTMLElement> {
  await user.click(screen.getByRole("button", { name: triggerName }));
  return screen.findByRole("menu");
}

test("lists everybody on the roster, ordered by name", async () => {
  await renderRoster();

  expect(lastNamesIn(cards())).toEqual([
    "Both",
    "Committee",
    "Direction",
    "Player",
    "Sansconnexion",
  ]);
});

test("the heading counts the roster the server holds, not the rows on screen", async () => {
  // `meta.total` rather than members.length, which would under-report the
  // band if the list were ever cut short.
  await renderRoster();

  expect(screen.getByTestId("roster-count")).toHaveTextContent("5 membres");
});

test("shows each person's register, and says plainly when they are in none", async () => {
  await renderRoster();

  // Labelled, since a card has no column heads.
  expect(rowFor("Player")).toHaveTextContent("Pupitre : Cloches");
  // Dominique organises and does not play, so there is no register. A blank
  // line reads as missing data; this is a fact about them.
  expect(rowFor("Direction")).toHaveTextContent("Pupitre : Aucun pupitre");
});

test("shows roles by their French label, never the key or the permissions", async () => {
  await renderRoster();

  const direction = rowFor("Direction");
  // "Why does she have this?" is answered with "because she is in Team
  // Direction" (ADR 0014), never the key or the raw permission strings.
  expect(direction).toHaveTextContent("Rôles : Team Direction");
  expect(direction.textContent).not.toContain("members.manage");

  expect(rowFor("Committee")).toHaveTextContent("Rôles : Comité, Membre, Musicien·ne");
});

test("creates a person and shows them in the list", async () => {
  await renderRoster();

  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));
  await userEvent.type(screen.getByLabelText("Prénom"), "Lea");
  await userEvent.type(screen.getByLabelText("Nom"), "Nouvelle");
  await userEvent.type(screen.getByLabelText("Identifiant"), "lea.nouvelle");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(await cards().findByText("Nouvelle")).toBeInTheDocument();
});

test("shows the new person's password once, as text that can be read aloud", async () => {
  await renderRoster();

  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));
  await userEvent.type(screen.getByLabelText("Prénom"), "Lea");
  await userEvent.type(screen.getByLabelText("Nom"), "Nouvelle");
  await userEvent.type(screen.getByLabelText("Identifiant"), "lea.nouvelle");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // The fixed value the mock returns, shown as text: a credential meant to be
  // dictated has no business in a password field.
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
  // The panel stays open, so nothing else typed is thrown away.
  expect(screen.getByLabelText("Prénom")).toHaveValue("Autre");
});

test("disables the role checkboxes on the create form, and says roles are assigned after saving", async () => {
  await renderRoster();
  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));

  // The API ignores roleIds on create: granting a permission is one guarded
  // operation. An inert checkbox needs an explanation.
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

  await expect.poll(() => rowFor("Player").textContent).toContain("Comité");
});

test("says plainly when a person holds no role at all", async () => {
  // The API never takes the baseline from anybody, but a hand edit in the
  // database can, and the roster must not print an empty line.
  setMemberRoles(2, []);
  await renderRoster();

  expect(rowFor("Player")).toHaveTextContent("Aucun rôle");
});

/** The open edit form, found by its heading so the roster's own filters stay out of reach. */
async function openEditFor(name: string): Promise<HTMLElement> {
  const lastName = name.split(" ").at(-1)!;
  await userEvent.click(within(rowFor(lastName)).getByRole("button", { name: `Modifier ${name}` }));
  const form = (await screen.findByRole("heading", { name: `Modifier ${name}` })).closest("form");
  if (!(form instanceof HTMLElement)) {
    throw new Error(`no form for ${name}`);
  }
  return form;
}

test("choosing a register pre-ticks the role that answers events", async () => {
  // A register grants nothing (#189): answering is attendance.respond, which
  // a role grants. Somebody given a register almost always plays, though, so
  // the form ticks the role for them, and the save is what grants it.
  await renderRoster();
  const form = await openEditFor("Dominique Direction");

  expect(within(form).getByLabelText("Musicien·ne")).not.toBeChecked();
  await userEvent.selectOptions(within(form).getByLabelText("Pupitre"), "Cloches");
  expect(within(form).getByLabelText("Musicien·ne")).toBeChecked();

  await userEvent.click(within(form).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => rowFor("Direction").textContent).toContain("Musicien·ne");
});

test("the pre-ticked role can be unticked, and the card then says so", async () => {
  await renderRoster();
  const form = await openEditFor("Dominique Direction");

  await userEvent.selectOptions(within(form).getByLabelText("Pupitre"), "Cloches");
  await userEvent.click(within(form).getByLabelText("Musicien·ne"));
  await userEvent.click(within(form).getByRole("button", { name: "Enregistrer" }));

  // toHaveTextContent, not textContent: it folds the non-breaking space French
  // puts before a colon.
  await waitFor(() => expect(rowFor("Direction")).toHaveTextContent("Pupitre : Cloches"));
  expect(rowFor("Direction")).not.toHaveTextContent("Musicien·ne");
  expect(
    within(rowFor("Direction")).getByLabelText(
      "Dans un pupitre, mais ne répond pas aux événements",
    ),
  ).toHaveTextContent("Ne répond pas aux événements");
});

test("the create form pre-ticks nothing, because its roles are not saved", async () => {
  // POST /members grants the baseline and ignores roleIds, so a ticked box
  // here would promise a grant the save never makes.
  await renderRoster();
  await userEvent.click(screen.getByRole("button", { name: "Ajouter une personne" }));
  const form = (await screen.findByRole("heading", { name: "Ajouter une personne" })).closest(
    "form",
  )!;

  await userEvent.selectOptions(within(form).getByLabelText("Pupitre"), "Cloches");
  expect(within(form).getByLabelText("Musicien·ne")).not.toBeChecked();
});

test("opening the form ticks nothing by itself", async () => {
  // Only choosing a register pre-ticks the role. Somebody already in one
  // without it may be that way on purpose, and opening the form to fix a
  // typo in their name must not grant them anything.
  setMemberRoles(2, [3]);
  await renderRoster();
  const form = await openEditFor("Perrine Player");

  expect(within(form).getByLabelText("Musicien·ne")).not.toBeChecked();
});

test("only a register without a role that answers events raises the warning", async () => {
  // Perrine plays and answers; Dominique answers nothing and plays in no
  // register. Neither is a mistake, so neither card carries the pill.
  setMemberRoles(5, [3]);
  await renderRoster();

  const warning = "Dans un pupitre, mais ne répond pas aux événements";
  expect(within(rowFor("Sansconnexion")).getByLabelText(warning)).toBeInTheDocument();
  expect(within(rowFor("Player")).queryByLabelText(warning)).toBeNull();
  expect(within(rowFor("Direction")).queryByLabelText(warning)).toBeNull();
});

test("the baseline role stays ticked and cannot be unticked", async () => {
  // The API answers 409 to a role list without it, so the form does not offer
  // an untick the save would refuse.
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );

  const baseline = screen.getByLabelText("Membre");
  expect(baseline).toBeChecked();
  expect(baseline).toBeDisabled();
  expect(screen.getByLabelText("Musicien·ne")).toBeEnabled();
});

test("changing a name and a role in one save does both", async () => {
  // The chained tag. Roles travel on their own endpoint, so this save is two
  // conditional writes, and the roles call has to quote the tag the PATCH
  // handed back. The form's original tag answers 412, and the role change is
  // lost silently because the name was already saved.
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );

  const lastName = await screen.findByLabelText("Nom", { exact: true });
  await userEvent.clear(lastName);
  await userEvent.type(lastName, "Joueuse");
  await userEvent.click(screen.getByLabelText("Comité"));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  const row = await cards().findByText("Joueuse");
  const changed = row.closest("[data-member]");
  expect(changed).not.toBeNull();
  expect(changed).toHaveTextContent("Rôles : Membre, Musicien·ne, Comité");
});

test("seats somebody on the committee by picking from the list, not by typing", async () => {
  // A list, not free text: a typo would be published on /committee, and the
  // list carries the rank /committee sorts by.
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );
  const seat = await screen.findByLabelText("Fonction au comité");
  expect(seat.tagName).toBe("SELECT");

  await userEvent.selectOptions(seat, "Présidente");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // Re-opening the form is the round trip: the card does not render the
  // seat, and the mock's PATCH allow-list mirrors UpdateMemberRequest, so a
  // field the API does not accept would be dropped silently.
  await screen.findByRole("button", { name: "Ajouter une personne" });
  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );

  expect(await screen.findByLabelText("Fonction au comité")).toHaveValue("1");
});

test("refuses to save over a change somebody else made while the form was open", async () => {
  // If-Match at the screen (ADR 0013): two administrators have the roster
  // open, and the second save must not silently discard the first.
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
    body: JSON.stringify({ committeeFunctionId: 4 }),
  });

  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // In French, from the `if_match_failed` token, and the form stays open so
  // the typing is not thrown away.
  expect(await screen.findByText(/modifié cet élément entre-temps/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
});

test("names the person and the consequence before deleting them", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining("Perrine Player"));
  expect(within(dialog).getByText(/accès au site/i)).toBeInTheDocument();
  // A member's answers cascade, so the planning loses them.
  expect(within(dialog).getByText(/réponses de présence seront effacées/i)).toBeInTheDocument();
});

test("requires the person's name to be typed before deleting", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));
  const dialog = await screen.findByRole("alertdialog");

  // The server does not re-authenticate a delete (ADR 0017), so the typed
  // confirmation is the only guard against a mis-aimed tap.
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(rowFor("Player")).toBeInTheDocument();
});

test("deletes the person once their name is typed", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.type(within(dialog).getByLabelText(/Perrine Player/), "Perrine Player");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  expect(await cards().findByText("Both")).toBeInTheDocument();
  expect(cards().queryByText("Player")).toBeNull();
});

/**
 * Members.tsx passes `confirmPhrase` to `ConfirmByTypingName`, unlike the
 * planning's delete dialog, so this is where the menu-to-dialog focus handoff
 * meets a field somebody has to type into.
 */
test("the delete dialog opens from the menu with a field that accepts the typed name", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));

  const dialog = await screen.findByRole("alertdialog");
  // The menu is gone: a dialog placed inside the menu's subtree would unmount
  // with it.
  await expect.poll(() => screen.queryByRole("menu")).toBeNull();

  const confirm = within(dialog).getByRole("button", { name: "Supprimer" });
  expect(confirm).toHaveAttribute("aria-disabled", "true");

  await user.type(within(dialog).getByLabelText(/Perrine Player/), "Perrine Player");

  expect(confirm).toHaveAttribute("aria-disabled", "false");
});

test("keeps the person and explains, when the server refuses", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Dominique Direction");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Dominique Direction" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.type(within(dialog).getByLabelText(/Dominique Direction/), "Dominique Direction");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  // The API's cannot_delete_self, translated. The server owns the invariant;
  // a copy of the rule here would drift.
  expect(
    await screen.findByText("Vous ne pouvez pas supprimer votre propre compte."),
  ).toBeInTheDocument();
  // Dialog stays open, so the refusal is read where the action was taken.
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  expect(rowFor("Direction")).toBeInTheDocument();
});

/**
 * A row goes busy while the read behind `Modifier` and `Supprimer` is in
 * flight (`opening === member.id` in Members.tsx), and both carry
 * `disabled: busy` on their `RowAction`, so the guard holds by keyboard too.
 * Without `disabled: busy` on the delete action, Radix no longer skips the
 * item in roving focus and the second ArrowDown lands on it.
 */
test("does not delete while a mutation is in flight, by keyboard either", async () => {
  await renderRoster();
  const user = userEvent.setup();

  // Never released, so `opening` stays set to Perrine's id.
  server.use(http.get("/api/v1/members/2", () => new Promise(() => {})));

  await user.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.keyboard("{ArrowDown}{ArrowDown}");

  expect(within(menu).getByRole("menuitem", { name: /^Supprimer Perrine/ })).not.toHaveFocus();
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

test("issues a replacement password and shows it once", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(
    within(menu).getByRole("menuitem", { name: "Réinitialiser le mot de passe de Perrine Player" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Réinitialiser" }));

  expect(await screen.findByTestId("generated-password")).toHaveTextContent("kanu-7rex-mp34");
});

/**
 * The text Radix points `aria-describedby` at: the dialog's description, as
 * distinct from its title and the confirmation field's label, which both
 * carry the person's name on purpose.
 */
function descriptionOf(dialog: HTMLElement): string {
  const id = dialog.getAttribute("aria-describedby");
  const described = id === null ? null : document.getElementById(id);
  if (described === null) {
    throw new Error("the dialog describes itself with nothing");
  }
  return described.textContent ?? "";
}

/**
 * #91: a first name in the description needs a participle agreeing with the
 * person's gender, which the roster does not hold. Each test pins that the
 * sentence agrees with "personne" and carries no name; the second assertion
 * survives a copy rewrite.
 */
test("the reset dialog does not agree in the masculine over the person it names", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(
    within(menu).getByRole("menuitem", { name: "Réinitialiser le mot de passe de Perrine Player" }),
  );
  const description = descriptionOf(await screen.findByRole("alertdialog"));

  expect(description).toContain("Cette personne sera déconnectée partout");
  expect(description).not.toContain("Perrine");
});

test("the delete dialog does not agree in the masculine over the person it names", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));
  const description = descriptionOf(await screen.findByRole("alertdialog"));

  expect(description).toContain("Cette personne sera retirée de la liste");
  expect(description).not.toContain("Perrine");
});

/**
 * #94: the roster shows whether a person can actually log in. What an
 * administrator may have to act on is a pill, and the rest is reference text;
 * these tests pin that split, not just the words.
 */
test("an account in normal use raises no pill, only its last login", async () => {
  await renderRoster();

  const row = within(rowFor("Direction"));

  expect(row.getByTestId("member-login-status")).toHaveTextContent(
    /^Dernière connexion le 1 septembre 2026$/,
  );
  expect(row.queryByTestId("member-login-pill-never-used")).toBeNull();
  expect(row.queryByTestId("member-login-pill-provisional")).toBeNull();
});

test("an account nobody has ever used is pilled, and reports no date", async () => {
  await renderRoster();

  // demo.player: a password of their own, never used.
  const row = within(rowFor("Player"));

  expect(row.getByTestId("member-login-pill-never-used")).toHaveTextContent("Jamais utilisé");
  expect(row.queryByTestId("member-login-pill-provisional")).toBeNull();
  expect(row.getByTestId("member-login-status")).not.toHaveTextContent("Dernière connexion");
});

test("a member still on a committee-issued password gets both pills", async () => {
  await renderRoster();

  // demo.both, the one fixture member still on a committee-issued password;
  // see initialMembers() in mocks/handlers.ts for why.
  const row = within(rowFor("Both"));

  expect(row.getByTestId("member-login-pill-never-used")).toHaveTextContent("Jamais utilisé");
  expect(row.getByTestId("member-login-pill-provisional")).toHaveTextContent("Provisoire");
});

// `Provisoire` on its own is not a phrase, and the pill is reached without the
// card around it to supply the missing noun.
test("the terse pill is announced with a name that stands on its own", async () => {
  await renderRoster();

  expect(within(rowFor("Both")).getByLabelText("Mot de passe provisoire")).toBeInTheDocument();
});

/* ---------------------------------------------------------------------------
 * The roster in German (#156)
 * -------------------------------------------------------------------------- */

test("the card's labels are German, and their colons lose the French space", async () => {
  await renderRoster("de-CH");

  expect(screen.getByRole("heading", { level: 1, name: "Mitglieder" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Person hinzufügen" })).toBeInTheDocument();

  // The catalogue pluralises: French counts zero as singular ("0 membre"),
  // German does not ("0 Mitglieder").
  expect(screen.getByTestId("roster-count")).toHaveTextContent("5 Mitglieder");

  const card = rowFor("Player");
  // "Benutzername:", not "Benutzername :": no French typography on a German
  // card.
  expect(card).toHaveTextContent("Benutzername: demo.player");
  expect(card).toHaveTextContent("Register: Cloches");
  // Every seeded account holds the member role, and Perrine plays in a register.
  expect(card).toHaveTextContent("Rollen: Mitglied, Musiker·in");
});

test("every accessible name still carries the person, in German", async () => {
  // A screen-reader user must hear which row they are on, not the twelfth
  // bare "Löschen" (see MemberActions in Members.tsx).
  //
  // `Bearbeiten` is the inline action; the other two sit behind the overflow
  // menu (#118) and are read from inside it once open.
  await renderRoster("de-CH");
  const user = userEvent.setup();

  expect(
    within(rowFor("Player")).getByRole("button", { name: "Perrine Player bearbeiten" }),
  ).toBeInTheDocument();

  const menu = await openMenuFor(user, "Weitere Aktionen für Perrine Player");
  expect(
    within(menu).getByRole("menuitem", { name: "Passwort von Perrine Player zurücksetzen" }),
  ).toBeInTheDocument();
  expect(
    within(menu).getByRole("menuitem", { name: "Perrine Player löschen" }),
  ).toBeInTheDocument();
});

test("the delete dialog reuses the button's own key for its title", async () => {
  await renderRoster("de-CH");
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Weitere Aktionen für Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Perrine Player löschen" }));

  const dialog = await screen.findByRole("alertdialog");
  // The button's accessible name and the dialog's title are both
  // members.deleteTitle, so they cannot disagree.
  expect(dialog).toHaveAccessibleName("Perrine Player löschen");

  // The typed confirmation, from common.typeToConfirm (#167); the planning's
  // delete asks for no phrase.
  expect(
    within(dialog).getByLabelText("Tippen Sie «Perrine Player», um zu bestätigen"),
  ).toBeInTheDocument();

  // "Diese Person", not the name: the title already says who. In French the
  // same sentence also avoids a gendered participle (#91).
  const description = descriptionOf(dialog);
  expect(description).toContain("Diese Person wird aus der Liste entfernt");
  expect(description).not.toContain("Perrine");
});

test("the reset dialog and the one-time password reveal are German", async () => {
  await renderRoster("de-CH");
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Weitere Aktionen für Perrine Player");
  await user.click(
    within(menu).getByRole("menuitem", { name: "Passwort von Perrine Player zurücksetzen" }),
  );

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName("Passwort von Perrine Player zurücksetzen");
  await user.click(within(dialog).getByRole("button", { name: "Zurücksetzen" }));

  const reveal = await screen.findByRole("alertdialog");
  expect(reveal).toHaveAccessibleName("Passwort von Perrine Player");
  expect(
    within(reveal).getByRole("button", { name: "Ich habe das Passwort notiert" }),
  ).toBeInTheDocument();
});

test("the login pills render on the card in German", async () => {
  await renderRoster("de-CH");

  // Perrine's fixture has never logged in, the state the pills exist to flag
  // (#94). Not Nadia: a parent uses her login (#148).
  const card = rowFor("Player");
  expect(within(card).getByTestId("member-login-pill-never-used")).toHaveTextContent("Nie benutzt");
  expect(within(card).getByTestId("member-login-pill-never-used")).toHaveAccessibleName(
    "Konto nie benutzt",
  );
});

/* ------------------------------------------------------------------------ *
 * Searching and filtering (#97)
 * ------------------------------------------------------------------------ */

test("typing a name narrows the roster, accents and case aside", async () => {
  const user = userEvent.setup();
  await renderRoster();

  // "perrine", no capital: the server's collation ignores case and accents,
  // and the mocked handler folds the same way.
  await user.type(screen.getByRole("searchbox", { name: "Rechercher un membre" }), "PERRINE");

  await screen.findByText("1 sur 5 membres");
  expect(lastNamesIn(cards())).toEqual(["Player"]);
});

test("the pupitre filter narrows the roster, and 'Aucun pupitre' finds the organisers", async () => {
  const user = userEvent.setup();
  await renderRoster();

  await user.selectOptions(screen.getByRole("combobox", { name: "Pupitre" }), "Cloches");
  await screen.findByText("1 sur 5 membres");
  expect(lastNamesIn(cards())).toEqual(["Player"]);

  await user.selectOptions(screen.getByRole("combobox", { name: "Pupitre" }), "none");
  await screen.findByText("1 sur 5 membres");
  expect(lastNamesIn(cards())).toEqual(["Direction"]);
});

test("the rôle filter narrows the roster and combines with the search", async () => {
  const user = userEvent.setup();
  await renderRoster();

  // Role 1 is `direction`: Dominique and Bastien hold it.
  await user.selectOptions(screen.getByRole("combobox", { name: "Rôle" }), "1");
  await screen.findByText("2 sur 5 membres");
  expect(lastNamesIn(cards())).toEqual(["Both", "Direction"]);

  await user.type(screen.getByRole("searchbox", { name: "Rechercher un membre" }), "bastien");
  await screen.findByText("1 sur 5 membres");
  expect(lastNamesIn(cards())).toEqual(["Both"]);
});

test("a search that finds nobody says so, and clearing it brings the roster back", async () => {
  const user = userEvent.setup();
  await renderRoster();

  await user.type(screen.getByRole("searchbox", { name: "Rechercher un membre" }), "zzz");

  expect(
    await screen.findByText("Aucun membre ne correspond à cette recherche."),
  ).toBeInTheDocument();
  expect(screen.getByTestId("roster-count")).toHaveTextContent("0 sur 5 membres");

  await user.click(screen.getByRole("button", { name: "Effacer les filtres" }));

  await screen.findByText("5 membres");
  expect(screen.getByRole("searchbox", { name: "Rechercher un membre" })).toHaveValue("");
  expect(lastNamesIn(cards())).toHaveLength(5);
});

test("the filtered count declines in German", async () => {
  const user = userEvent.setup();
  await renderRoster("de-CH");

  await user.type(screen.getByRole("searchbox", { name: "Mitglied suchen" }), "perrine");

  // Dative after «von»: «Mitgliedern», which no French-shaped plural gives.
  expect(await screen.findByText("1 von 5 Mitgliedern")).toBeInTheDocument();
});

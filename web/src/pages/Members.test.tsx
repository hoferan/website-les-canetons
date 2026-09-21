import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Members } from "./Members";

/**
 * Every assertion here depends on the roster having arrived, so the helper
 * waits for it rather than each test remembering to.
 */
async function renderRoster(locale: Locale = "fr") {
  setMockUser("demo.direction");
  const result = await renderWithSession(<Members />, { route: "/members", locale });
  await screen.findAllByText("Sansconnexion");
  return result;
}

/**
 * The roster. ONE LAYOUT since #130 — cards at every width, in a grid that
 * widens. There was a table above `md` as well until 2026-09-18, and since
 * jsdom applies no CSS every person appeared twice in this file, so every
 * query had to say which of the two it meant.
 */
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
 * `Supprimer` — which moved behind it — can be queried inside.
 *
 * Takes the trigger's WHOLE accessible name rather than building it from
 * French, the same reason Events.test.tsx's own `openMenuFor` does: a German
 * test below opens the same menu by its German name, and a helper that
 * concatenated "Autres actions pour" itself could never serve it.
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
  // `meta.total` rather than members.length. The two agree today, and the
  // reason to read the server's number is that they would stop agreeing the
  // moment this list were ever cut short — at which point counting what
  // arrived would quietly under-report the band.
  await renderRoster();

  expect(screen.getByTestId("roster-count")).toHaveTextContent("5 membres");
});

test("shows each person's register, and says plainly when they are in none", async () => {
  await renderRoster();

  // LABELLED, since the column head that said what this is went with the
  // table (#130).
  expect(rowFor("Player")).toHaveTextContent("Pupitre : Cloches");
  // Dominique organises and does not play, so there is no register. A blank
  // line reads as missing data; this is a fact about them.
  expect(rowFor("Direction")).toHaveTextContent("Pupitre : Aucun pupitre");
});

test("shows roles by their French label, never the key or the permissions", async () => {
  await renderRoster();

  const direction = rowFor("Direction");
  // "why does she have this?" is answered with "because she is in Team
  // Direction" (design §3) — never the key "direction", and never the raw
  // permission strings.
  // On the whole line, because the card labels its fields — "Rôles : Team
  // Direction" — since #130 took the column heads away with the table.
  expect(direction).toHaveTextContent("Rôles : Team Direction");
  expect(direction.textContent).not.toContain("members.manage");

  expect(rowFor("Committee")).toHaveTextContent("Rôles : Comité");
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

  await expect.poll(() => rowFor("Player").textContent).toContain("Comité");
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

  const row = await cards().findByText("Joueuse");
  const changed = row.closest("[data-member]");
  expect(changed).not.toBeNull();
  expect(changed).toHaveTextContent("Rôles : Comité");
});

test("seats somebody on the committee by picking from the list, not by typing", async () => {
  // FREE TEXT UNTIL 2026-09-14, and all three of its problems were invisible
  // from this screen: a typo here was published on a page the band hands out,
  // nothing beside the text ranked the seats so /committee could only sort
  // alphabetically, and a typed name is content no translation layer reaches.
  await renderRoster();

  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );
  const seat = await screen.findByLabelText("Fonction au comité");
  expect(seat.tagName).toBe("SELECT");

  await userEvent.selectOptions(seat, "Présidente");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // RE-OPENING THE FORM IS THE ROUND TRIP. Nothing on the roster table renders
  // the seat, so reading it back is the only way to prove the value survived
  // the PATCH — whose allow-list mirrors what UpdateMemberRequest validates,
  // and would silently drop a field the API does not accept.
  await screen.findByRole("button", { name: "Ajouter une personne" });
  await userEvent.click(
    within(rowFor("Player")).getByRole("button", { name: "Modifier Perrine Player" }),
  );

  expect(await screen.findByLabelText("Fonction au comité")).toHaveValue("1");
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
    body: JSON.stringify({ committeeFunctionId: 4 }),
  });

  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  // In French, from the `if_match_failed` token — and the form stays open, so
  // the typing is not thrown away along with the save.
  expect(await screen.findByText(/modifié cet élément entre-temps/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enregistrer" })).toBeInTheDocument();
});

test("names the person and the consequence before deleting them", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));

  // "Êtes-vous sûr ?" is a question nobody reads. The name is what makes the
  // dialog worth stopping for.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining("Perrine Player"));
  expect(within(dialog).getByText(/accès au site/i)).toBeInTheDocument();
  // And what else goes with them. A member's answers cascade, so the planning
  // loses them, and the committee should read that before they press.
  expect(within(dialog).getByText(/réponses de présence seront effacées/i)).toBeInTheDocument();
});

test("requires the person's name to be typed before deleting", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));
  const dialog = await screen.findByRole("alertdialog");

  // Decision B7: the server no longer re-authenticates a delete, so this typed
  // confirmation is the ONLY guard against a mis-aimed tap. Pressing the button
  // with the box empty must do nothing at all.
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
 * planning's own delete dialog — so this is the one place in the branch that
 * exercises the menu -> dialog focus handoff against a field somebody actually
 * has to type into (spec §3). The planning's equivalent test says explicitly
 * why it could carry no field: "typing a title back is friction with nothing
 * behind it."
 */
test("the delete dialog opens from the menu with a field that accepts the typed name", async () => {
  await renderRoster();
  const user = userEvent.setup();

  const menu = await openMenuFor(user, "Autres actions pour Perrine Player");
  await user.click(within(menu).getByRole("menuitem", { name: "Supprimer Perrine Player" }));

  const dialog = await screen.findByRole("alertdialog");
  // THE MENU IS GONE, not merely closed in spirit: a dialog placed inside the
  // menu's own subtree would unmount with it, which is what the equivalent
  // planning test guards against by a different route.
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

/**
 * Review Focus 4. A row goes busy while the read behind `Modifier` and
 * `Supprimer` is in flight (`opening === member.id` in Members.tsx), and both
 * carry `disabled: busy` on their `RowAction`. This proves the guard survives
 * being reached by keyboard, not only by a disabled click handler's early
 * return.
 *
 * MUTATION TEST: drop `disabled: busy` from the "delete" action in
 * MemberActions and this fails — Radix stops excluding the item from roving
 * focus, so the second ArrowDown lands on it.
 */
test("does not delete while a mutation is in flight, by keyboard either", async () => {
  await renderRoster();
  const user = userEvent.setup();

  // Held open, and never released: nothing here needs the read to finish,
  // only for `opening` to stay set to Perrine's id for the rest of the test.
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
 * The text Radix points `aria-describedby` at — the dialog's description, as
 * distinct from its title and the confirmation field's label, both of which
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
 * #91: both dialogs interpolated a first name into a fixed masculine participle
 * — "Amélie sera déconnecté partout" — and four of the seven members seeded on
 * TEST are women.
 *
 * The fix writes round the agreement rather than asking the roster for a gender
 * field the band has no reason to hold, so what each test pins is that the
 * sentence agrees with "personne" and carries NO name at all. The second
 * assertion is the one that survives a copy rewrite: a name back in the
 * description is a masculine participle back with it, because that is the only
 * reason to put one there.
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
 * #94. The roster said nothing about whether a person could actually log in,
 * so a member still holding a committee-issued password looked identical to
 * one using the site every week.
 *
 * The first version said it in a muted sentence and was read straight past,
 * so what an administrator may have to ACT on is a pill and the rest is
 * reference text. These tests pin that split, not just the words.
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

  // demo.both — the one fixture member still on a committee-issued password;
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

  // FOUND BY READING THE RENDERED PAGE, not the diff: this said "5 membres"
  // beside a German heading for the whole first pass. It was
  // `rosterCount > 1 ? "s" : ""` — the French rule, which is right in French
  // ("0 membre") and wrong in German ("0 Mitglieder"). No accented character
  // in it, so no grep over the file would have found it either.
  expect(screen.getByTestId("roster-count")).toHaveTextContent("5 Mitglieder");

  const card = rowFor("Player");
  // "Benutzername:", not "Benutzername :". These were `Identifiant&nbsp;:`
  // composed in JSX, which is French typography reaching a German card — the
  // same bug as #152's Tbd separator, found in a fourth place.
  expect(card).toHaveTextContent("Benutzername: demo.player");
  expect(card).toHaveTextContent("Register: Cloches");
  // Perrine holds no role, which is also the seeded case for "Keine Rolle".
  expect(card).toHaveTextContent("Rollen: Keine Rolle");
});

test("EVERY ACCESSIBLE NAME STILL CARRIES THE PERSON, in German", async () => {
  // The property Members.tsx's MemberActions docblock demands: a screen-reader
  // user must hear which row they are on, not the twelfth bare "Löschen" on
  // the page. Translating the three actions is exactly where that gets lost,
  // because the shortest German word is the tempting one.
  //
  // `Bearbeiten` stays a page-level query, being the designated inline
  // action; the other two moved behind the overflow menu (#118) and are read
  // from inside it once open.
  //
  // MUTATION TEST: swap any of these for a bare t("common.delete") and the
  // matching query finds two items instead of one, once the menu is open.
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
  // ONE KEY, TWO PLACES — the button's accessible name and the dialog's title
  // are members.deleteTitle, so they cannot come to disagree.
  expect(dialog).toHaveAccessibleName("Perrine Player löschen");

  // The typed confirmation, from common.typeToConfirm (#167) — its first
  // German outing, since the planning's delete asks for no phrase.
  expect(
    within(dialog).getByLabelText("Tippen Sie «Perrine Player», um zu bestätigen"),
  ).toBeInTheDocument();

  // "Diese Person", not the name: the title already says who, and saying it
  // twice in one dialog reads worse in both languages. In French the same
  // sentence additionally avoids a participle agreeing over the person (#91)
  // — see the two tests above, which are unchanged.
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

  // Nadia's fixture has never logged in, which is the state the pills exist
  // to make the committee look at (#94).
  const card = rowFor("Sansconnexion");
  expect(within(card).getByTestId("member-login-pill-never-used")).toHaveTextContent("Nie benutzt");
  expect(within(card).getByTestId("member-login-pill-never-used")).toHaveAccessibleName(
    "Konto nie benutzt",
  );
});

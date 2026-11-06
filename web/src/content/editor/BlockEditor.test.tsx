import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, expect, test } from "vitest";

import { t } from "../../i18n";
import { problem } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, renderBlockEditor, storeBlock } from "../../test/renderBlockEditor";
import { BLOCKS } from "../registry";
import { RowFields } from "./RowFields";
import { TranslatedField } from "./TranslatedField";

afterEach(() => server.events.removeAllListeners());

const shipped = BLOCKS["home.hero"].defaults();

function heroFields() {
  return <TranslatedField name="title" label="Titre" />;
}

/** The toast carrying this sentence, so a leftover one is never the match. */
async function toastSaying(sentence: string): Promise<HTMLElement> {
  const line = await screen.findByText(sentence);
  const toast = line.closest("[data-sonner-toast]");
  if (!(toast instanceof HTMLElement)) {
    throw new Error(`"${sentence}" was rendered outside a toast`);
  }
  return toast;
}

test("the editor is titled by the block's place and opens on what the page shows", async () => {
  storeBlock("home.hero", { title: { fr: "Bonjour", de: "Hallo" } });
  const dialog = await renderBlockEditor("home.hero", heroFields);

  expect(within(dialog).getByRole("heading", { name: t("blocks.home.hero") })).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Bonjour");
  expect(within(dialog).getByRole("textbox", { name: "Titre DE" })).toHaveValue("Hallo");
});

test("Rétablir fills the fields with the original and saves nothing", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  storeBlock("home.hero", { title: { fr: "Bonjour", de: "Hallo" } });
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));

  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue(shipped.title.fr);
  expect(within(dialog).getByRole("textbox", { name: "Titre DE" })).toHaveValue(shipped.title.de);
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(puts).toEqual([]);
});

test("saving the original unchanged sends null", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  storeBlock("home.hero", { title: { fr: "Bonjour", de: "Hallo" } });
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toEqual([{ key: "home.hero", body: { data: null } }]);
});

test("save shows Enregistrement… then a toast and closes", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.put("/api/v1/blocks/:key", async () => {
      await held;
      return HttpResponse.json({ block: null });
    }),
  );
  const dialog = await renderBlockEditor("home.hero", heroFields);

  const french = within(dialog).getByRole("textbox", { name: "Titre FR" });
  await user.clear(french);
  await user.type(french, "Coin coin");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  // The same button, relabelled: focus stays on it while the save runs.
  const pending = within(dialog).getByRole("button", { name: "Enregistrement…" });
  expect(pending).toHaveAttribute("aria-disabled", "true");
  expect(pending).toHaveAttribute("type", "submit");
  await user.click(pending);

  release();
  await toastSaying("Modifié");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // One write, the second click landing on a pending save.
  expect(puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({
    data: { ...shipped, title: { ...shipped.title, fr: "Coin coin" } },
  });
});

test("a refused save keeps the dialog open with the message", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/blocks/:key", () =>
      problem(400, "validation_failed", "Invalid form submission", []),
    ),
  );
  const dialog = await renderBlockEditor("home.hero", heroFields);

  const french = within(dialog).getByRole("textbox", { name: "Titre FR" });
  await user.type(french, " !");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(t("errors.validation_failed"))).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBe(dialog);
  // Ready for another try.
  expect(within(dialog).getByRole("button", { name: "Enregistrer" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("a block the server finds too large says so in French", async () => {
  const user = userEvent.setup();
  server.use(
    http.put("/api/v1/blocks/:key", () =>
      problem(400, "validation_failed", "Invalid form submission", [
        { field: "data", reason: "block_too_large" },
      ]),
    ),
  );
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), " !");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  // The dialog has no input called `data`, so its reason is the error line.
  const alert = await within(dialog).findByText(
    `${t("fields.data")} ${t("validation.block_too_large")}`,
  );
  expect(alert.textContent).toBe("Contenu est trop volumineux");
});

type User = ReturnType<typeof userEvent.setup>;

/** The ways out of an editor that do not save, each as the editor does it. */
const CLOSE_PATHS: [string, (user: User, dialog: HTMLElement) => Promise<void>][] = [
  [
    "Annuler",
    (user, dialog) => user.click(within(dialog).getByRole("button", { name: "Annuler" })),
  ],
  ["Escape", (user) => user.keyboard("{Escape}")],
  [
    "a tap outside",
    async (user) => {
      const overlay = document.querySelector('[data-slot="dialog-overlay"]');
      if (!(overlay instanceof HTMLElement)) throw new Error("no dialog overlay");
      await user.pointer({ keys: "[MouseLeft]", target: overlay });
    },
  ],
];

/** Whether a reload now would raise the browser's warning. */
function reloadWarns(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const discardTitle = t("blockEditor.discardTitle");

test.each(CLOSE_PATHS)("%s closes an untouched editor at once", async (_path, close) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await close(user, dialog);

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(puts).toEqual([]);
});

test.each(CLOSE_PATHS)("%s asks before throwing typed changes away", async (_path, close) => {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("home.hero", heroFields);
  const french = within(dialog).getByRole("textbox", { name: "Titre FR" });
  await user.type(french, " !");

  await close(user, dialog);
  const question = await screen.findByRole("alertdialog", { name: discardTitle });

  // Keep editing: the question goes, the editor stays with what was typed.
  await user.click(within(question).getByRole("button", { name: "Continuer la modification" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByRole("dialog")).toBe(dialog);
  expect(french).toHaveValue(`${shipped.title.fr} !`);

  // Asked again, and this time thrown away.
  await close(user, dialog);
  const again = await screen.findByRole("alertdialog", { name: discardTitle });
  await user.click(within(again).getByRole("button", { name: "Abandonner" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(puts).toEqual([]);

  // The next opening starts from the page again, not from the abandoned edit.
  await user.click(screen.getByRole("button", { name: "Ouvrir" }));
  const reopened = await screen.findByRole("dialog");
  expect(within(reopened).getByRole("textbox", { name: "Titre FR" })).toHaveValue(shipped.title.fr);
});

test("Escape on the question keeps the editor open", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("home.hero", heroFields);
  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), " !");

  await user.keyboard("{Escape}");
  await screen.findByRole("alertdialog", { name: discardTitle });
  await user.keyboard("{Escape}");

  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByRole("dialog")).toBe(dialog);
});

test("the question's safe answer has the focus, and the confirm comes first", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("home.hero", heroFields);
  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), " !");

  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  const question = await screen.findByRole("alertdialog", { name: discardTitle });

  const buttons = within(question).getAllByRole("button");
  expect(buttons.map((button) => button.textContent)).toEqual([
    "Abandonner",
    "Continuer la modification",
  ]);
  expect(buttons[1]).toHaveFocus();
});

test("typing a change and taking it back closes at once", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("home.hero", heroFields);
  const french = within(dialog).getByRole("textbox", { name: "Titre FR" });

  await user.type(french, " !");
  await user.type(french, "{Backspace}{Backspace}");
  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("Rétablir l'original counts as a change", async () => {
  const user = userEvent.setup();
  storeBlock("home.hero", { title: { fr: "Bonjour", de: "Hallo" } });
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

  expect(await screen.findByRole("alertdialog", { name: discardTitle })).toBeInTheDocument();
});

test("Rétablir counts even where the page already shows the original", async () => {
  // Saving it would still delete a stored copy, so it is not nothing.
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  await user.keyboard("{Escape}");

  expect(await screen.findByRole("alertdialog", { name: discardTitle })).toBeInTheDocument();
});

test("a reload warns only while the editor holds changes", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("home.hero", heroFields);
  expect(reloadWarns()).toBe(false);

  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), " !");
  expect(reloadWarns()).toBe(true);

  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  const question = await screen.findByRole("alertdialog", { name: discardTitle });
  await user.click(within(question).getByRole("button", { name: "Abandonner" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(reloadWarns()).toBe(false);
});

test("a saved edit closes without asking and stops the reload warning", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), " !");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(puts).toHaveLength(1);
  expect(reloadWarns()).toBe(false);
});

test("a non-https link is refused", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("committee.contact", () => (
    <RowFields name="cards.0.rows" />
  ));

  await user.click(within(dialog).getByRole("button", { name: "Ajouter une ligne" }));
  await user.click(await screen.findByRole("menuitem", { name: "Lien" }));

  const url = within(dialog).getByRole("textbox", { name: "Adresse du lien" });
  await user.type(url, "http://lescanetons.ch");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(t("blockEditor.httpsExpected"))).toBeInTheDocument();
  expect(url).toHaveAttribute("aria-invalid", "true");
  expect(puts).toEqual([]);

  await user.clear(url);
  await user.type(url, "https://lescanetons.ch");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => puts.length).toBe(1);
});

test("a phone number that is not one is refused", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("committee.contact", () => (
    <RowFields name="cards.0.rows" />
  ));

  const number = within(dialog).getByRole("textbox", { name: "Numéro" });
  await user.type(number, "appelez-nous");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(t("blockEditor.phoneInvalid"))).toBeInTheDocument();
  expect(puts).toEqual([]);

  await user.clear(number);
  await user.type(number, "+41 26 123 45 67");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => puts.length).toBe(1);
});

test("a stored number the editor's check refuses opens as stored and is not saved", async () => {
  // Written by an import or straight through the API: the page shows it,
  // and only an editor saving it is told to correct it.
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const twoNumbers = "079 123 45 67 / 026 123 45 67";
  storeBlock("committee.contact", {
    cards: [
      {
        id: "contact",
        icon: "phone",
        tint: "yellow",
        title: { fr: "Contact" },
        rows: [{ type: "phone", label: { fr: "Réservations" }, number: twoNumbers }],
      },
    ],
  });
  const dialog = await renderBlockEditor("committee.contact", () => (
    <RowFields name="cards.0.rows" />
  ));

  expect(within(dialog).getByRole("textbox", { name: "Numéro" })).toHaveValue(twoNumbers);
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(t("blockEditor.phoneInvalid"))).toBeInTheDocument();
  expect(puts).toEqual([]);
});

test.each([
  ["left untouched", false],
  ["typed, then emptied again", true],
])("an address row saves without a place name %s", async (_how, typed) => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("committee.contact", () => (
    <RowFields name="cards.0.rows" />
  ));

  await user.click(within(dialog).getByRole("button", { name: "Ajouter une ligne" }));
  await user.click(await screen.findByRole("menuitem", { name: "Adresse" }));

  if (typed) {
    const place = within(dialog).getByRole("textbox", { name: "Lieu FR" });
    await user.type(place, "Werkhof");
    await user.clear(place);
  }
  await user.type(within(dialog).getByRole("textbox", { name: "Adresse" }), "Route de Marly 1");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts.length).toBe(1);
  const data = (puts[0]?.body as { data: { cards: { rows: unknown[] }[] } }).data;
  expect(data.cards[0]?.rows[1]).toEqual({ type: "address", address: "Route de Marly 1" });
});

test("a value refused outside the fields shown says so in the error line", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  storeBlock("committee.contact", {
    cards: [
      {
        id: "contact",
        icon: "phone",
        tint: "yellow",
        title: { fr: "Contact" },
        rows: [{ type: "phone", label: { fr: "Réservations" }, number: "abc" }],
      },
    ],
  });
  const dialog = await renderBlockEditor("committee.contact", () => (
    <TranslatedField name="cards.0.title" label="Titre" />
  ));

  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(t("blockEditor.invalid"))).toBeInTheDocument();
  expect(puts).toEqual([]);
});

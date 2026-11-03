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
      problem(400, "validation_failed", "Invalid form submission", [
        { field: "data", reason: "required" },
      ]),
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

test("Annuler closes without saving", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("home.hero", heroFields);

  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), " !");
  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(puts).toEqual([]);
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

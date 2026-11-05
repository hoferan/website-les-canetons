import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { setLocale } from "../../i18n";
import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, storeBlock } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { EDIT_MODE_KEY } from "../EditMode";
import { BLOCKS } from "../registry";
import { HeroActions, HeroBlock } from "./HeroBlock";

afterEach(() => server.events.removeAllListeners());

const shipped = BLOCKS["join.hero"].defaults();

const highlight = () => document.querySelector("h1 .bg-highlight");

/** Whether a paragraph on the page reads the shipped intro, wherever the hero puts it. */
const introShown = () =>
  [...document.querySelectorAll("p")].some((p) => p.textContent === shipped.intro!.fr);

test("the default hero renders the heading, its highlight and the intro", async () => {
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(shipped.title.fr);
  expect(highlight()?.textContent).toBe("la guggen");
  expect(document.querySelector("h1 + div p")?.textContent).toBe(shipped.intro!.fr);
  expect(screen.queryByRole("button")).toBeNull();
});

test("a stored title that no longer holds the highlighted words renders plain", async () => {
  storeBlock("join.hero", { title: { fr: "Rejoins-nous" }, mark: { fr: "la guggen" } });
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Rejoins-nous");
  expect(highlight()).toBeNull();
});

test("the German band page lights its shipped highlight", async () => {
  await renderWithSession(<HeroBlock blockKey="band.hero" seed={5} />, {
    route: "/de/band",
    locale: "de-CH",
  });

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unsere Canetons");
  expect(highlight()?.textContent).toBe("Canetons");
});

test("a German title takes its highlight from the German mark only", async () => {
  // The French word is in the German title too, but the band never picked it
  // for German: the German page must not light it, as the picker shows nothing.
  storeBlock("band.hero", {
    title: { fr: "Nos Canetons", de: "Unsere Canetons" },
    mark: { fr: "Canetons" },
  });
  await renderWithSession(<HeroBlock blockKey="band.hero" seed={5} />, {
    route: "/de/band",
    locale: "de-CH",
  });

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unsere Canetons");
  expect(highlight()).toBeNull();
});

test("without a German title the German page shows the French title and mark", async () => {
  storeBlock("band.hero", { title: { fr: "Nos Canetons" }, mark: { fr: "Canetons" } });
  await renderWithSession(<HeroBlock blockKey="band.hero" seed={5} />, {
    route: "/de/band",
    locale: "de-CH",
  });

  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nos Canetons");
  expect(highlight()?.textContent).toBe("Canetons");
});

test("Aucun on the German row clears the German highlight and keeps the French one", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<HeroBlock blockKey="band.hero" seed={5} />, { route: "/band" });

  await user.click(screen.getByRole("button", { name: "Modifier : Les canetons · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  const german = within(dialog).getByRole("group", { name: "Mots surlignés DE" });
  expect(within(german).getByRole("button", { name: "Canetons" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(within(german).getByRole("button", { name: "Aucun" }));
  expect(within(german).getByRole("button", { name: "Canetons" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const data = (puts[0]!.body as { data: { mark?: unknown } }).data;
  expect(data.mark).toEqual({ fr: "Canetons" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // The French page keeps its own highlight.
  expect(highlight()?.textContent).toBe("Canetons");
});

test("the hero chip edits title and intro together", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  const title = within(dialog).getByRole("textbox", { name: "Titre FR" });
  const intro = within(dialog).getByRole("textbox", { name: "Introduction FR" });
  expect(title).toHaveValue(shipped.title.fr);
  expect(intro).toHaveValue(shipped.intro!.fr);

  await user.clear(title);
  await user.type(title, "Viens jouer avec nous");
  await user.clear(intro);
  await user.type(intro, "Les souffleurs sont les bienvenus.");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]).toEqual({
    key: "join.hero",
    body: {
      data: {
        ...shipped,
        title: { ...shipped.title, fr: "Viens jouer avec nous" },
        intro: { ...shipped.intro, fr: "Les souffleurs sont les bienvenus." },
        // The new title no longer holds the French words; the German ones stay.
        mark: { ...shipped.mark, fr: "" },
      },
    },
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    await screen.findByRole("heading", { level: 1, name: "Viens jouer avec nous" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Les souffleurs sont les bienvenus.")).toBeInTheDocument();
  expect(highlight()).toBeNull();
});

test("clearing a saved intro removes it", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });
  // The page shows it first, so the check after saving can fail.
  expect(introShown()).toBe(true);

  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  const intro = within(dialog).getByRole("textbox", { name: "Introduction FR" });
  expect(intro).toHaveValue(shipped.intro!.fr);
  const picked = within(dialog).getByRole("group", { name: "Mots surlignés FR" });
  expect(within(picked).getByRole("button", { name: "la" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // The shipped texts carry a German wording; it goes with the French.
  for (const remove of within(dialog).getAllByRole("button", { name: "Retirer l’allemand" })) {
    await user.click(remove);
  }
  await user.clear(intro);
  await user.click(within(picked).getByRole("button", { name: "Aucun" }));
  expect(intro).toHaveValue("");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const data = (puts[0]!.body as { data: Record<string, unknown> }).data;
  expect(data).not.toHaveProperty("intro");
  expect(data).not.toHaveProperty("mark");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(introShown()).toBe(false);
});

const buttons = [
  { label: { fr: "Nous rejoindre", de: "Mitmachen" }, to: "/join" },
  { label: { fr: "Où nous voir" }, to: "/agenda" },
];

test("a stored hero shows its buttons, the first raised and the second light", async () => {
  storeBlock("join.hero", { title: { fr: "Rejoins-nous" }, actions: buttons });
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });

  const [first, second] = screen.getAllByRole("link");
  expect(first).toHaveTextContent("Nous rejoindre");
  expect(first).toHaveAttribute("href", "/join");
  expect(first!.className).toContain("bg-yellow");
  expect(second).toHaveTextContent("Où nous voir");
  expect(second).toHaveAttribute("href", "/agenda");
  expect(second!.className).toContain("bg-white");
});

test("a hero with no button draws no row of buttons", async () => {
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });

  expect(screen.queryByRole("link")).toBeNull();
});

test("an internal button keeps the visitor in German under /de, in German words", async () => {
  await setLocale("de-CH");
  render(
    <MemoryRouter basename="/de" initialEntries={["/de"]}>
      <HeroActions actions={buttons} />
    </MemoryRouter>,
  );

  expect(screen.getByRole("link", { name: "Mitmachen" })).toHaveAttribute("href", "/de/join");
  // No German wording: the French one stands in.
  expect(screen.getByRole("link", { name: "Où nous voir" })).toHaveAttribute("href", "/de/agenda");
});

test("an https button opens in a new tab without a referrer, and any other target is dropped", () => {
  render(
    <MemoryRouter>
      <HeroActions
        actions={[
          { label: { fr: "Flickr" }, to: "https://www.flickr.com/photos/canetons" },
          { label: { fr: "Piégé" }, to: "javascript:alert(1)" },
        ]}
      />
    </MemoryRouter>,
  );

  // The new tab is announced, as every outbound link on the site does.
  const link = screen.getByRole("link", { name: "Flickr (nouvel onglet)" });
  expect(link).toHaveTextContent("Flickr");
  expect(link).toHaveAttribute("href", "https://www.flickr.com/photos/canetons");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
  expect(screen.queryByRole("link", { name: "Piégé" })).toBeNull();
});

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });
  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  return screen.findByRole("dialog");
}

test("the editor adds a button aimed at a public page, by its nav name", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await openEditor(user);

  const section = within(dialog).getByRole("group", { name: "Boutons" });
  await user.click(within(section).getByRole("button", { name: "Ajouter un bouton" }));
  await user.type(within(section).getByRole("textbox", { name: "Libellé FR" }), "Où nous voir");
  const target = within(section).getByRole("combobox", { name: "Destination" });
  // Every public page, under the name the nav gives it, then the escape hatch.
  expect(
    within(target)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual([
    "Nous rejoindre",
    "Où nous voir",
    "Les canetons",
    "Contact",
    "Comité",
    "Histoire",
    "Autre lien (https)",
  ]);
  await user.selectOptions(target, "/agenda");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const data = (puts[0]!.body as { data: { actions: unknown } }).data;
  expect(data.actions).toEqual([{ label: { fr: "Où nous voir" }, to: "/agenda" }]);
});

test("the editor offers two buttons at most", async () => {
  const user = userEvent.setup();
  storeBlock("join.hero", { title: { fr: "Rejoins-nous" }, actions: buttons });
  const dialog = await openEditor(user);

  expect(within(dialog).queryByRole("button", { name: "Ajouter un bouton" })).toBeNull();
  await user.click(within(dialog).getAllByRole("button", { name: "Supprimer" })[1]!);
  expect(within(dialog).getByRole("button", { name: "Ajouter un bouton" })).toBeInTheDocument();
});

test("another link takes an https address and refuses javascript: and http:", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await openEditor(user);

  await user.click(within(dialog).getByRole("button", { name: "Ajouter un bouton" }));
  await user.type(within(dialog).getByRole("textbox", { name: "Libellé FR" }), "Photos");
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: "Destination" }),
    "Autre lien (https)",
  );
  const url = within(dialog).getByRole("textbox", { name: "Adresse du lien" });

  for (const refused of ["javascript:alert(1)", "http://example.ch"]) {
    await user.clear(url);
    await user.type(url, refused);
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    expect(await within(dialog).findByText(/commençant par https:\/\//)).toBeInTheDocument();
    expect(puts).toHaveLength(0);
  }

  await user.clear(url);
  await user.type(url, "https://www.flickr.com/photos/canetons");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => puts).toHaveLength(1);
  expect((puts[0]!.body as { data: { actions: unknown } }).data.actions).toEqual([
    { label: { fr: "Photos" }, to: "https://www.flickr.com/photos/canetons" },
  ]);
});

test("removing every button stores a hero without any", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  storeBlock("join.hero", { title: { fr: "Rejoins-nous" }, actions: buttons });
  const dialog = await openEditor(user);

  for (let i = 0; i < 2; i++) {
    await user.click(within(dialog).getAllByRole("button", { name: "Supprimer" })[0]!);
  }
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const data = (puts[0]!.body as { data: { actions?: unknown } }).data;
  // The join hero ships none, so none is the shipped hero and nothing is pinned.
  expect(data).not.toHaveProperty("actions");
});

test("removing the home hero's shipped buttons stores an empty list, not the shipped ones", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<HeroBlock blockKey="home.hero" seed={5} />, { route: "/" });

  await user.click(screen.getByRole("button", { name: "Modifier : Accueil · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  for (let i = 0; i < 2; i++) {
    await user.click(within(dialog).getAllByRole("button", { name: "Supprimer" })[0]!);
  }
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect((puts[0]!.body as { data: { actions: unknown } }).data.actions).toEqual([]);
});

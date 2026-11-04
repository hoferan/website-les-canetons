import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, storeBlock } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { EDIT_MODE_KEY } from "../EditMode";
import { BLOCKS } from "../registry";
import { HeroBlock } from "./HeroBlock";

afterEach(() => server.events.removeAllListeners());

const shipped = BLOCKS["join.hero"].defaults();

const highlight = () => document.querySelector("h1 .bg-highlight");

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

  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  const intro = within(dialog).getByRole("textbox", { name: "Introduction FR" });
  const mark = within(dialog).getByRole("textbox", { name: "Mots surlignés FR" });
  expect(intro).toHaveValue(shipped.intro!.fr);
  expect(mark).toHaveValue("la guggen");
  // The shipped texts carry a German wording; it goes with the French.
  for (const remove of within(dialog).getAllByRole("button", { name: "Retirer l’allemand" })) {
    await user.click(remove);
  }
  await user.clear(intro);
  await user.clear(mark);
  expect(intro).toHaveValue("");
  expect(mark).toHaveValue("");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const data = (puts[0]!.body as { data: Record<string, unknown> }).data;
  expect(data).not.toHaveProperty("intro");
  expect(data).not.toHaveProperty("mark");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.querySelector("h1 + div p")).toBeNull();
});

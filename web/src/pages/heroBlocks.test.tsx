import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import type { HeroKey } from "../content/blocks/HeroBlock";
import { setMockUser } from "../mocks/handlers";
import { AppRoutes } from "../routes";
import { storeBlock } from "../test/renderBlockEditor";
import { renderWithSession } from "../test/renderWithSession";

/** Every public page and the block its hero reads. */
const PAGES: Array<[string, HeroKey, string]> = [
  ["/", "home.hero", "Accueil · en-tête"],
  ["/join", "join.hero", "Nous rejoindre · en-tête"],
  ["/agenda", "agenda.hero", "Où nous voir · en-tête"],
  ["/band", "band.hero", "Les canetons · en-tête"],
  ["/contact", "contact.hero", "Contact · en-tête"],
  ["/committee", "committee.hero", "Comité · en-tête"],
  ["/history", "history.hero", "Histoire · en-tête"],
];

test.each(PAGES)("%s shows the stored hero", async (route, key) => {
  storeBlock(key, { title: { fr: "Un titre du groupe" }, intro: { fr: "Une phrase du groupe." } });
  await renderWithSession(<AppRoutes />, { route });

  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Un titre du groupe");
  expect(screen.getByText("Une phrase du groupe.")).toBeInTheDocument();
});

test.each(PAGES)("%s gives its hero a chip in edit mode", async (route, _key, label) => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route });

  expect(await screen.findByRole("button", { name: `Modifier : ${label}` })).toBeInTheDocument();
});

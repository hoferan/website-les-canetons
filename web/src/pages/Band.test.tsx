import { screen, waitFor, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { HttpResponse, delay, http } from "msw";

import {
  setMemberVisibility,
  setMockUser,
  setMockUserWithPermissions,
  setSectionNameDe,
} from "../mocks/handlers";
import { server } from "../mocks/node";
import { cardPencil } from "../test/cardControls";
import { storeBlock } from "../test/renderBlockEditor";
import { renderWithSession } from "../test/renderWithSession";
import { EDIT_MODE_KEY } from "../content/EditMode";
import { Band } from "./Band";

/**
 * The mocked roster mirrors DevSeeder: Nadia plays in Batteurs, Perrine in
 * Cloches, Bastien in Trompettes and teaches Batteurs, Camille in Trombones.
 * Dominique organises and plays in nothing, so she appears nowhere here.
 */
test("lists each register with the people who play in it", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const drums = await screen.findByRole("article", { name: "Batteurs" });
  expect(within(drums).getByText(/Nadia/)).toBeInTheDocument();
});

test("lists an instructor under the register they teach, not the one they play in", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  // Bastien plays trumpet and teaches the drummers, which is why the two
  // columns behind them are separate.
  const drums = await screen.findByRole("article", { name: "Batteurs" });
  expect(within(drums).getByText(/Moniteurs/)).toHaveTextContent("Bastien");

  const trumpets = screen.getByRole("article", { name: "Trompettes" });
  expect(within(trumpets).queryByText(/Moniteurs/)).not.toBeInTheDocument();
  expect(within(trumpets).getByText(/Bastien/)).toBeInTheDocument();
});

/**
 * The screen side of consent (the API has its own test): the page renders
 * what the API sends, not a roster cached from elsewhere.
 */
test("drops somebody who has withdrawn their consent to appear", async () => {
  setMemberVisibility(2, false); // Perrine, in Cloches.
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  expect(within(bells).queryByText(/Perrine/)).not.toBeInTheDocument();
  // And the register stays, with its gap written out.
  expect(within(bells).getByText(/à compléter/)).toBeInTheDocument();
});

/**
 * A register nobody has consented to appear in keeps its heading; dropping it
 * would let a reader infer that a particular child said no. Filtering empty
 * registers out of the map fails this test and no other.
 */
test("keeps a register whose members have all withheld consent", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const lyre = await screen.findByRole("article", { name: "Lyre" });
  expect(within(lyre).getByText(/à compléter/)).toBeInTheDocument();
});

/**
 * Every index link has to land on something, including empty registers. The
 * index is built from the whole answer and the body could be built from a
 * filtered one, and a link to a missing anchor fails silently.
 */
test("offers a jump link per register, each landing on that register", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const index = await screen.findByRole("navigation", { name: "Registres" });
  const links = within(index).getAllByRole("link");
  expect(links).toHaveLength(6);

  for (const link of links) {
    const anchor = link.getAttribute("href")?.slice(1) ?? "";
    const register = document.getElementById(anchor);
    expect(register, `the index links to #${anchor}, which is not on the page`).not.toBeNull();
    expect(register).toHaveAccessibleName(link.textContent ?? "");
  }

  // Lyre is the empty one in the seeded roster, and therefore the one a
  // filtered page body would drop.
  expect(within(index).getByRole("link", { name: "Lyre" })).toHaveAttribute("href", "#register-3");
});

/** Nothing about an account reaches this page. */
test("publishes first names and no account details", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  await screen.findByRole("article", { name: "Cloches" });
  expect(screen.queryByText(/demo\.player/)).not.toBeInTheDocument();
  // The surname travels in the response, for the committee page.
  expect(screen.queryByText(/Sansconnexion/)).not.toBeInTheDocument();
});

test("renders the heading, the register index and a placeholder gap in German", async () => {
  await renderWithSession(<Band />, { route: "/band", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Unsere Canetons" })).toBeInTheDocument();
  expect(await screen.findByRole("navigation", { name: "Register" })).toBeInTheDocument();

  // Lyre is the empty one in the seeded roster (see the French test above).
  const lyre = await screen.findByRole("article", { name: "Lyre" });
  expect(within(lyre).getByText(/zu ergänzen/)).toBeInTheDocument();
});

test("names a register in German where it has a German name, and in French where not", async () => {
  setSectionNameDe(3, "Leier");
  await renderWithSession(<Band />, { route: "/band", locale: "de-CH" });

  expect(await screen.findByRole("article", { name: "Leier" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Cloches" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Leier" })).toBeInTheDocument();
});

test("keeps the French name on the French page", async () => {
  setSectionNameDe(3, "Leier");
  await renderWithSession(<Band />, { route: "/band" });

  expect(await screen.findByRole("article", { name: "Lyre" })).toBeInTheDocument();
});

test("shows the German photo placeholder in every empty slot", async () => {
  // The mock places a band photo, which would replace the placeholder.
  server.use(
    http.get("/api/v1/photo-slots", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );
  await renderWithSession(<Band />, { route: "/band", locale: "de-CH" });

  // One sentence for every slot, so the band and each register read the same.
  await waitFor(() => expect(screen.getAllByText(/Foto folgt/).length).toBeGreaterThan(1));
});

/**
 * The mocked roster places a photo on the band and on Trompettes only. A slot
 * with a photo shows it and gives up its placeholder; every other slot keeps
 * the placeholder. A page slot carries no alt text, so the band's photo is
 * named after the band and a register's after the register.
 */
test("shows the placed band photo and no band placeholder", async () => {
  const { container } = await renderWithSession(<Band />, { route: "/band" });

  expect(await screen.findByRole("img", { name: "Les Canetons de Fribourg" })).toBeInTheDocument();
  expect(container.querySelector('[data-photo-pending="band"]')).toBeNull();
});

test("shows a register's photo in place of its placeholder, and keeps the placeholder elsewhere", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const trumpets = await screen.findByRole("article", { name: "Trompettes" });
  await within(trumpets).findByRole("img", { name: "Trompettes" });
  expect(trumpets.querySelector("[data-photo-pending]")).toBeNull();

  const bells = screen.getByRole("article", { name: "Cloches" });
  expect(within(bells).queryByRole("img")).not.toBeInTheDocument();
  expect(bells.querySelector('[data-photo-pending="register-4"]')).not.toBeNull();
});

test("keeps the band placeholder when no band photo is placed", async () => {
  server.use(
    http.get("/api/v1/photo-slots", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );
  const { container } = await renderWithSession(<Band />, { route: "/band" });

  await screen.findByRole("article", { name: "Cloches" });
  await waitFor(() =>
    expect(container.querySelector('[data-photo-pending="band"]')).not.toBeNull(),
  );
});

test("reserves the band frame, without a caption, while the photo slots are still loading", async () => {
  server.use(http.get("/api/v1/photo-slots", () => delay("infinite")));
  const { container } = await renderWithSession(<Band />, { route: "/band" });

  await screen.findByRole("article", { name: "Cloches" });
  expect(container.querySelector('[data-photo-pending="band"]')).toBeNull();
  const reserved = container.querySelector("[data-photo-reserved]");
  expect(reserved).not.toBeNull();
  expect(reserved).toHaveAttribute("aria-hidden", "true");
  expect(reserved).toBeEmptyDOMElement();
});

test("keeps the band placeholder when the photo slots cannot be read", async () => {
  server.use(http.get("/api/v1/photo-slots", () => HttpResponse.error()));
  const { container } = await renderWithSession(<Band />, { route: "/band" });

  await waitFor(() =>
    expect(container.querySelector('[data-photo-pending="band"]')).not.toBeNull(),
  );
});

/**
 * The godparents card waits for the roster: rendered while the registers
 * above it load, it would be pushed out of a phone's first screen (#236).
 */
test("holds the godparents card while the roster is loading", async () => {
  server.use(http.get("/api/v1/band", () => delay("infinite")));

  await renderWithSession(<Band />, { route: "/band" });

  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Le parrain et la marraine" }),
  ).not.toBeInTheDocument();
});

test("shows the godparents card when the roster cannot be read", async () => {
  server.use(http.get("/api/v1/band", () => new HttpResponse(null, { status: 503 })));

  await renderWithSession(<Band />, { route: "/band" });

  expect(
    await screen.findByRole("heading", { name: "Le parrain et la marraine" }),
  ).toBeInTheDocument();
});

test("in edit mode the hero and the godparents' card carry a chip", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band" });

  expect(
    await screen.findByRole("button", { name: cardPencil("Le parrain et la marraine") }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Modifier : Les canetons · en-tête" }),
  ).toBeInTheDocument();
});

test("the godparents' card is a card with its title, photo slot and names", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const heading = await screen.findByRole("heading", { name: "Le parrain et la marraine" });
  const card = heading.closest("[data-slot='card']")!;
  expect(
    within(card as HTMLElement).getByText("Richard Hertig et Annick Bürgisser"),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(card.querySelector("[data-photo-pending='band.godparents.godparents']")).not.toBeNull(),
  );
});

test("the godparents' card shows the stored title and names", async () => {
  storeBlock("band.godparents", {
    cards: [
      {
        id: "godparents",
        icon: "heart",
        tint: "pink",
        title: { fr: "Nos parrains" },
        rows: [{ type: "text", text: { fr: "Jean Dupont et Marie Rossier" } }],
        photo: true,
      },
    ],
  });
  await renderWithSession(<Band />, { route: "/band" });

  expect(await screen.findByRole("heading", { name: "Nos parrains" })).toBeInTheDocument();
  expect(screen.getByText("Jean Dupont et Marie Rossier")).toBeInTheDocument();
});

test("a godparents block stored in the old fields shape falls back to the default card", async () => {
  storeBlock("band.godparents", {
    heading: { fr: "Nos parrains" },
    names: { fr: "Jean Dupont et Marie Rossier" },
  });
  await renderWithSession(<Band />, { route: "/band" });

  expect(
    await screen.findByRole("heading", { name: "Le parrain et la marraine" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Jean Dupont et Marie Rossier")).toBeNull();
});

/** The first names come from the roster, so the gap says where to fill it. */
test("an empty register's gap points at the members page, in both languages", async () => {
  const { unmount } = await renderWithSession(<Band />, { route: "/band" });

  const lyre = await screen.findByRole("article", { name: "Lyre" });
  expect(lyre.querySelector("[data-tbd='register-first-names']")?.textContent).toBe(
    "••• à compléter sur la page Membres : prénoms du registre",
  );
  unmount();

  await renderWithSession(<Band />, { route: "/band", locale: "de-CH" });
  const leier = await screen.findByRole("article", { name: "Lyre" });
  expect(leier.querySelector("[data-tbd='register-first-names']")?.textContent).toBe(
    "••• auf der Seite Mitglieder zu ergänzen: Vornamen des Registers",
  );
});

test("in edit mode, one notice links to Membres and Pupitres, and not otherwise", async () => {
  setMockUser("demo.direction");
  const { unmount } = await renderWithSession(<Band />, { route: "/band" });
  await screen.findByRole("heading", { name: "Trombones" });
  expect(screen.queryByText(/se gèrent dans/)).toBeNull();
  unmount();

  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<Band />, { route: "/band" });
  const register = (await screen.findByRole("heading", { name: "Trombones" })).closest("article")!;
  // Said once for the page, not per register (#345).
  expect(within(register).queryByRole("link", { name: "Membres" })).toBeNull();
  const members = screen.getByText(/^Les musiciens de chaque registre se gèrent dans/);
  expect(members.textContent).toBe("Les musiciens de chaque registre se gèrent dans Membres.");
  expect(within(members).getByRole("link", { name: "Membres" })).toHaveAttribute(
    "href",
    "/members",
  );
  const registers = screen.getByText(/^Les registres, leurs noms et leur ordre/);
  expect(within(registers).getByRole("link", { name: "Pupitres" })).toHaveAttribute(
    "href",
    "/registers",
  );
  expect(screen.getAllByText(/se gèrent dans/)).toHaveLength(2);
});

test("the band's notice is absent without members.manage", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUserWithPermissions("demo.direction", ["content.manage"]);
  await renderWithSession(<Band />, { route: "/band" });
  await screen.findByRole("heading", { name: "Trombones" });
  expect(screen.queryByText(/se gèrent dans/)).toBeNull();
});

test("the band's notice reads in German on the German page", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Band />, { route: "/band", locale: "de-CH" });
  const line = await screen.findByText(/^Wer in welchem Register spielt/);
  expect(line.textContent).toBe("Wer in welchem Register spielt, wird unter Mitglieder verwaltet.");
  expect(within(line).getByRole("link", { name: "Mitglieder" })).toBeInTheDocument();
});

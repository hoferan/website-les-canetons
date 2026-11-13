import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import { BLOCKS } from "../content/registry";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { AppRoutes } from "../routes";
import { removeLine } from "../test/lineControls";
import { recordBlockPuts, storeBlock } from "../test/renderBlockEditor";
import { renderWithSession } from "../test/renderWithSession";

afterEach(() => server.events.removeAllListeners());

// Radix sizes a radio's hidden form input with ResizeObserver, which jsdom
// lacks. Stubbed here only: DesktopNav and Confetti test their jsdom fallback.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => vi.unstubAllGlobals());

const shipped = BLOCKS.site.defaults();

/** The shipped site info with some of it changed. */
function site(change: Partial<typeof shipped>) {
  return { ...shipped, ...change };
}

function without(label: string) {
  return shipped.networks.filter((entry) => entry.label !== label);
}

test("the band's name, pitch and legal name in the footer and the header follow the stored site", async () => {
  storeBlock(
    "site",
    site({
      name: "Les Petits Canards",
      pitch: { fr: "On joue fort." },
      legalName: "Association des Petits Canards",
    }),
  );
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  expect(within(footer).getByText("Les Petits Canards")).toBeInTheDocument();
  expect(within(footer).getByText("On joue fort.")).toBeInTheDocument();
  expect(footer).toHaveTextContent("Association des Petits Canards.");
  // The header's logo link and the phone menu's carry the name.
  expect(screen.getAllByRole("link", { name: "Les Petits Canards" }).length).toBeGreaterThan(0);
  expect(screen.queryAllByRole("link", { name: shipped.name })).toHaveLength(0);
});

test("a network the band removed disappears from the nav and the footer", async () => {
  storeBlock("site", site({ networks: without("Instagram") }));
  await renderWithSession(<AppRoutes />, { route: "/join" });

  expect(screen.queryAllByRole("link", { name: /Instagram/ })).toHaveLength(0);
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  expect(within(nav).getByRole("link", { name: "Facebook (nouvel onglet)" })).toBeInTheDocument();
  expect(
    within(screen.getByRole("contentinfo")).getByRole("link", { name: /^Facebook/ }),
  ).toBeInTheDocument();
});

test("a stored link replaces the network's address everywhere", async () => {
  storeBlock(
    "site",
    site({
      networks: [
        ...without("Facebook"),
        { label: "Facebook", url: "https://www.facebook.com/lespetitscanards", icon: "facebook" },
      ],
    }),
  );
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const links = screen.getAllByRole("link", { name: /Facebook/ });
  expect(links.length).toBeGreaterThan(1);
  for (const link of links) {
    expect(link).toHaveAttribute("href", "https://www.facebook.com/lespetitscanards");
  }
});

test("a stored network address that is not https is never a link", async () => {
  storeBlock(
    "site",
    site({
      networks: [
        ...without("Flickr"),
        { label: "Flickr", url: "javascript:alert(1)", icon: "flickr" },
      ],
    }),
  );
  await renderWithSession(<AppRoutes />, { route: "/join" });

  expect(screen.queryAllByRole("link", { name: /Flickr/ })).toHaveLength(0);
  expect(document.querySelector("a[href^='javascript:']")).toBeNull();
});

test("an editor removes a network from the footer's site editor, and it leaves nav and footer", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  // One chip for the whole footer.
  expect(within(footer).getAllByRole("button", { name: /Modifier/ })).toHaveLength(1);
  await user.click(within(footer).getByRole("button", { name: "Modifier les infos du site" }));
  const dialog = await screen.findByRole("dialog", { name: "Infos du site" });
  const instagram = within(within(dialog).getByRole("group", { name: "Réseaux" })).getAllByRole(
    "listitem",
  )[0]!;
  await removeLine(user, instagram);
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(screen.queryAllByRole("link", { name: /Instagram/ })).toHaveLength(0));
  expect(puts).toEqual([
    { key: "site", body: { data: { ...shipped, networks: without("Instagram") } } },
  ]);
  expect(screen.getAllByRole("link", { name: /Facebook/ }).length).toBeGreaterThan(0);
});

test("a visitor, or an editor with edit mode off, gets no chip in the footer", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/join" });

  expect(
    within(screen.getByRole("contentinfo")).queryByRole("button", {
      name: "Modifier les infos du site",
    }),
  ).toBeNull();
});

test("edit mode stays off outside the public pages", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/members" });

  await screen.findByRole("contentinfo");
  expect(screen.queryByRole("button", { name: "Modifier les infos du site" })).toBeNull();
});

test("the footer's chip floats over the footer, out of its flow", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  const chip = within(footer).getByRole("button", { name: "Modifier les infos du site" });
  expect(chip).toHaveTextContent("Modifier les infos du site");
  // The chip's bar is placed below the scallops, and its positioning parent
  // is the footer. On the black stage its shadow is the pink one.
  const placed = chip.closest("[data-action-bar='chip']");
  expect(placed).toHaveClass("absolute", "top-9", "shadow-raised-stage");
  expect(footer).toHaveClass("relative");
  expect(placed?.parentElement).toBe(footer);
});

/** The footer's buttons: its links that are neither a network nor the logo. */
function buttons() {
  return within(screen.getByRole("contentinfo"))
    .getAllByRole("link")
    .filter((link) => link.hasAttribute("data-variant"));
}

test("the footer ships with its two buttons, to /join and /contact", async () => {
  await renderWithSession(<AppRoutes />, { route: "/agenda" });

  expect(buttons().map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["Nous rejoindre", "/join"],
    ["Contact", "/contact"],
  ]);
});

test("a site block stored before the footer had buttons keeps the shipped two", async () => {
  const older: Partial<typeof shipped> = { ...shipped, name: "Les Petits Canards" };
  delete older.actions;
  storeBlock("site", older);
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  expect(within(footer).getByText("Les Petits Canards")).toBeInTheDocument();
  expect(buttons().map((link) => link.textContent)).toEqual(["Nous rejoindre", "Contact"]);
});

test("the stored buttons replace the shipped ones, in German too", async () => {
  storeBlock(
    "site",
    site({
      actions: [
        { label: { fr: "Notre agenda", de: "Unsere Agenda" }, to: "/agenda" },
        { label: { fr: "Photos", de: "Fotos" }, to: "https://www.flickr.com/canetons" },
      ],
    }),
  );
  await renderWithSession(<AppRoutes />, { route: "/join", locale: "de-CH" });

  const [agenda, photos] = buttons();
  expect(buttons()).toHaveLength(2);
  expect(agenda).toHaveTextContent("Unsere Agenda");
  expect(agenda).toHaveAttribute("href", "/de/agenda");
  expect(agenda).not.toHaveAttribute("target");
  // An address elsewhere opens a new tab and says so, as the networks do.
  expect(photos).toHaveTextContent("Fotos");
  expect(photos).toHaveAttribute("href", "https://www.flickr.com/canetons");
  expect(photos).toHaveAttribute("target", "_blank");
  expect(photos).toHaveAttribute("rel", "noreferrer");
  expect(photos).toHaveAccessibleName("Fotos (neuer Tab)");
});

test("a footer emptied of buttons draws none, and a stored javascript: target never becomes a link", async () => {
  storeBlock("site", site({ actions: [] }));
  const { unmount } = await renderWithSession(<AppRoutes />, { route: "/join" });
  expect(buttons()).toHaveLength(0);
  unmount();

  storeBlock("site", site({ actions: [{ label: { fr: "Piège" }, to: "javascript:alert(1)" }] }));
  await renderWithSession(<AppRoutes />, { route: "/join" });
  expect(buttons()).toHaveLength(0);
  expect(document.querySelector("a[href^='javascript:']")).toBeNull();
});

test("an editor changes a footer button, removes the other, and restores both", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  await user.click(within(footer).getByRole("button", { name: "Modifier les infos du site" }));
  let dialog = await screen.findByRole("dialog", { name: "Infos du site" });
  const buttonsField = within(dialog).getByRole("group", { name: "Boutons" });
  const [first, second] = within(buttonsField).getAllByRole("listitem");
  const label = within(first!).getByRole("textbox", { name: "Libellé FR" });
  await user.clear(label);
  await user.type(label, "Viens jouer");
  await removeLine(user, second!);
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(buttons().map((link) => link.textContent)).toEqual(["Viens jouer"]));
  expect(puts[0]?.body).toEqual({
    data: {
      ...shipped,
      actions: [{ label: { ...shipped.actions![0]!.label, fr: "Viens jouer" }, to: "/join" }],
    },
  });

  await user.click(within(footer).getByRole("button", { name: "Modifier les infos du site" }));
  dialog = await screen.findByRole("dialog", { name: "Infos du site" });
  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() =>
    expect(buttons().map((link) => link.textContent)).toEqual(["Nous rejoindre", "Contact"]),
  );
});

test("the footer's chip says when a text of the site has no German", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  storeBlock("site", site({ pitch: { fr: "Une guggen d’enfants." } }));
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  expect(
    await within(footer).findByRole("button", {
      name: "Modifier les infos du site (sans allemand)",
    }),
  ).toContainElement(footer.querySelector("[data-flag]") as HTMLElement);
});

test("each network is a link named after it, with the icon the band picked", async () => {
  storeBlock(
    "site",
    site({
      networks: [
        { label: "Nos vidéos", url: "https://www.youtube.com/@canetons", icon: "youtube" },
        { label: "Notre blog", url: "https://blog.example.ch", icon: "link" },
      ],
    }),
  );
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  const videos = within(footer).getByRole("link", { name: "Nos vidéos (nouvel onglet)" });
  expect(videos).toHaveAttribute("href", "https://www.youtube.com/@canetons");
  expect(videos).toHaveAttribute("target", "_blank");
  expect(videos).toHaveTextContent("Nos vidéos");
  expect(videos.querySelector("[data-icon='youtube']")).not.toBeNull();
  const blog = within(footer).getByRole("link", { name: "Notre blog (nouvel onglet)" });
  expect(blog.querySelector("[data-icon='link']")).not.toBeNull();
  expect(within(footer).queryAllByRole("link", { name: /Instagram|Facebook|Flickr/ })).toHaveLength(
    0,
  );
});

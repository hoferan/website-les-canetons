import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import { BLOCKS } from "../content/registry";
import type { Network } from "../content/types";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { AppRoutes } from "../routes";
import { recordBlockPuts, storeBlock } from "../test/renderBlockEditor";
import { renderWithSession } from "../test/renderWithSession";

afterEach(() => server.events.removeAllListeners());

const shipped = BLOCKS.site.defaults();

/** The shipped site info with some of it changed. */
function site(change: Partial<typeof shipped>) {
  return { ...shipped, ...change };
}

function without(network: Network) {
  return shipped.networks.filter((entry) => entry.network !== network);
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
  storeBlock("site", site({ networks: without("instagram") }));
  await renderWithSession(<AppRoutes />, { route: "/join" });

  expect(screen.queryAllByRole("link", { name: /Instagram/ })).toHaveLength(0);
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  expect(
    within(nav).getByRole("link", { name: "Facebook des Canetons (nouvel onglet)" }),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("contentinfo")).getByRole("link", { name: /^Facebook/ }),
  ).toBeInTheDocument();
});

test("a stored link replaces the network's address everywhere", async () => {
  storeBlock(
    "site",
    site({
      networks: [
        ...without("facebook"),
        { network: "facebook", url: "https://www.facebook.com/lespetitscanards" },
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
    site({ networks: [...without("flickr"), { network: "flickr", url: "javascript:alert(1)" }] }),
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
  const instagram = within(dialog).getAllByRole("listitem")[0]!;
  await user.click(within(instagram).getByRole("button", { name: "Supprimer" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await waitFor(() => expect(screen.queryAllByRole("link", { name: /Instagram/ })).toHaveLength(0));
  expect(puts).toEqual([
    { key: "site", body: { data: { ...shipped, networks: without("instagram") } } },
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

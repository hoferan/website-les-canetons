import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, storeBlock } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { BLOCKS } from "../registry";
import { useSite } from "./SiteBlock";
import { SiteEditor } from "./SiteEditor";

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

function Harness() {
  const site = useSite();
  const [open, setOpen] = useState(true);
  return (
    <>
      <p data-testid="name">{site.name}</p>
      <SiteEditor open={open} onClose={() => setOpen(false)} />
    </>
  );
}

test("useSite gives the shipped site info outside the provider", () => {
  function Name() {
    return <p>{useSite().name}</p>;
  }
  render(<Name />);

  expect(screen.getByText(shipped.name)).toBeInTheDocument();
});

test("the site editor changes the name, drops a network and saves", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  await renderWithSession(<Harness />, { route: "/" });
  const dialog = await screen.findByRole("dialog", { name: "Infos du site" });

  const name = within(dialog).getByRole("textbox", { name: "Nom du groupe" });
  await user.clear(name);
  await user.type(name, "Les Canetons");
  // The networks in their order, each with its name; the facebook one goes.
  expect(
    within(dialog)
      .getAllByRole("textbox", { name: "Nom du réseau" })
      .map((input) => (input as HTMLInputElement).value),
  ).toEqual(["Instagram", "Facebook", "Flickr"]);
  const facebook = within(dialog).getAllByRole("listitem")[1]!;
  await user.click(within(facebook).getByRole("button", { name: "Supprimer" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]).toEqual({
    key: "site",
    body: {
      data: {
        ...shipped,
        name: "Les Canetons",
        networks: shipped.networks.filter((network) => network.label !== "Facebook"),
      },
    },
  });
  await waitFor(() => expect(screen.getByTestId("name")).toHaveTextContent("Les Canetons"));
});

test("a network address that is not https is refused", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  storeBlock("site", { ...shipped, networks: [] });
  await renderWithSession(<Harness />, { route: "/" });
  const dialog = await screen.findByRole("dialog", { name: "Infos du site" });

  await user.click(within(dialog).getByRole("button", { name: "Ajouter un réseau" }));
  await user.type(within(dialog).getByRole("textbox", { name: "Nom du réseau" }), "Photos");
  await user.click(within(dialog).getByRole("radio", { name: "Flickr" }));
  const url = within(dialog).getByRole("textbox", { name: "Adresse de la page" });
  await user.type(url, "http://flickr.com/canetons");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(/https:\/\//)).toBeInTheDocument();
  expect(puts).toEqual([]);

  await user.clear(url);
  await user.type(url, "https://flickr.com/canetons");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({
    data: {
      ...shipped,
      networks: [{ label: "Photos", url: "https://flickr.com/canetons", icon: "flickr" }],
    },
  });
});

test("a network of any name and brand is saved as its name, address and icon", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  storeBlock("site", { ...shipped, networks: [] });
  await renderWithSession(<Harness />, { route: "/" });
  const dialog = await screen.findByRole("dialog", { name: "Infos du site" });

  await user.click(within(dialog).getByRole("button", { name: "Ajouter un réseau" }));
  // A new network starts on the generic link icon.
  expect(within(dialog).getByRole("radio", { name: "Lien" })).toBeChecked();
  await user.type(within(dialog).getByRole("textbox", { name: "Nom du réseau" }), "Nos vidéos");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Adresse de la page" }),
    "https://www.youtube.com/@canetons",
  );
  await user.click(within(dialog).getByRole("radio", { name: "YouTube" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({
    data: {
      ...shipped,
      networks: [
        { label: "Nos vidéos", url: "https://www.youtube.com/@canetons", icon: "youtube" },
      ],
    },
  });
});

test("a network without a name is refused", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  setMockUser("demo.direction");
  storeBlock("site", { ...shipped, networks: [] });
  await renderWithSession(<Harness />, { route: "/" });
  const dialog = await screen.findByRole("dialog", { name: "Infos du site" });

  await user.click(within(dialog).getByRole("button", { name: "Ajouter un réseau" }));
  await user.type(
    within(dialog).getByRole("textbox", { name: "Adresse de la page" }),
    "https://example.ch",
  );
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(puts).toEqual([]);
});

test("a stored site block in the old {network, url} shape falls back to the shipped one", async () => {
  setMockUser("demo.direction");
  storeBlock("site", {
    ...shipped,
    name: "Old",
    networks: [{ network: "flickr", url: "https://flickr.com/canetons" }],
  });
  await renderWithSession(<Harness />, { route: "/" });

  await waitFor(() => expect(screen.getByTestId("name")).toHaveTextContent(shipped.name));
});

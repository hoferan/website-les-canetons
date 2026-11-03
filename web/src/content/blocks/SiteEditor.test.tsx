import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, test } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, storeBlock } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { BLOCKS } from "../registry";
import { useSite } from "./SiteBlock";
import { SiteEditor } from "./SiteEditor";

afterEach(() => server.events.removeAllListeners());

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
  // The networks in their order, each with its picker; the facebook one goes.
  expect(
    within(dialog)
      .getAllByRole("combobox", { name: "Réseau" })
      .map((select) => (select as HTMLSelectElement).value),
  ).toEqual(["instagram", "facebook", "flickr"]);
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
        networks: shipped.networks.filter((network) => network.network !== "facebook"),
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
  await user.selectOptions(within(dialog).getByRole("combobox", { name: "Réseau" }), "flickr");
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
    data: { ...shipped, networks: [{ network: "flickr", url: "https://flickr.com/canetons" }] },
  });
});

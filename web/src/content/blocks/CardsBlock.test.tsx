import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, storeBlock } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { EDIT_MODE_KEY } from "../EditMode";
import { BLOCKS } from "../registry";
import { CardsBlock } from "./CardsBlock";

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

function editing() {
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
}

test("the default join cards render as today", async () => {
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
    "Instruments recherchés",
    "Horaires",
    "Critères d’âge",
    "Lieu",
    "Contacts",
  ]);
  // One paragraph per instrument, from the single list.
  for (const instrument of ["Trompette", "Trombone", "Sousaphone", "Euphonium"]) {
    expect(screen.getByText(instrument).tagName).toBe("P");
  }
  const map = screen.getByRole("link", { name: "Werkhof" });
  expect(map).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent("Werkhof, Planche-Inférieure 14, 1700 Fribourg"),
  );
  expect(map).toHaveAttribute("target", "_blank");
  expect(screen.getByText("Basse-Ville de Fribourg")).toBeInTheDocument();
  expect(document.querySelectorAll("[data-tbd='join-contact']")).toHaveLength(2);
  // A visitor sees no edit control.
  expect(screen.queryByRole("button")).toBeNull();
});

test("an editor adds a card, sets icon, colour and a phone row, and saves", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: "Ajouter une carte" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), "Répétitions");
  await user.click(within(dialog).getByRole("radio", { name: "Étoile" }));
  await user.click(within(dialog).getByRole("radio", { name: "Rose" }));
  await user.click(within(dialog).getByRole("button", { name: "Ajouter une ligne" }));
  await user.click(await screen.findByRole("menuitem", { name: "Téléphone" }));
  await user.type(within(dialog).getByRole("textbox", { name: "Libellé FR" }), "Anne");
  await user.type(within(dialog).getByRole("textbox", { name: "Numéro" }), "079 123 45 67");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]).toEqual({
    key: "join.facts",
    body: {
      data: {
        cards: [
          ...BLOCKS["join.facts"].defaults().cards,
          {
            id: expect.any(String),
            icon: "star",
            tint: "pink",
            title: { fr: "Répétitions" },
            rows: [{ type: "phone", label: { fr: "Anne" }, number: "079 123 45 67" }],
          },
        ],
      },
    },
  });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByRole("heading", { name: "Répétitions" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "079 123 45 67" })).toHaveAttribute(
    "href",
    "tel:+41791234567",
  );
});

test("each card's chip opens that card, and moving it saves the new order", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Horaires");

  await user.click(within(dialog).getByRole("button", { name: "Déplacer à gauche" }));
  // The editor follows its card, which is now the first.
  expect(within(dialog).getByRole("button", { name: "Déplacer à gauche" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Horaires");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const [instruments, schedule, ...rest] = BLOCKS["join.facts"].defaults().cards;
  expect(puts[0]?.body).toEqual({ data: { cards: [schedule, instruments, ...rest] } });
});

test("deleting the last card leaves Ajouter une carte in edit mode", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="committee.contact" />, { route: "/committee" });

  await user.click(screen.getByRole("button", { name: "Modifier : Contact des Canetons" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer la carte" }));
  const confirm = await screen.findByRole("alertdialog", { name: "Supprimer cette carte ?" });
  await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));

  await expect
    .poll(() => puts)
    .toEqual([{ key: "committee.contact", body: { data: { cards: [] } } }]);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "Contact des Canetons" })).toBeNull(),
  );
  expect(screen.getByRole("button", { name: "Ajouter une carte" })).toBeInTheDocument();
});

test("a stored card list shows as stored", async () => {
  storeBlock("committee.contact", {
    cards: [
      {
        id: "contact",
        icon: "phone",
        tint: "yellow",
        title: { fr: "Nous joindre", de: "Erreichen Sie uns" },
        rows: [{ type: "labelValue", label: { fr: "Lieu" }, value: { fr: "Werkhof" } }],
      },
    ],
  });
  await renderWithSession(<CardsBlock blockKey="committee.contact" />, { route: "/committee" });

  expect(await screen.findByRole("heading", { name: "Nous joindre" })).toBeInTheDocument();
  expect(screen.getByText(/^Lieu\s:\sWerkhof$/)).toBeInTheDocument();
});

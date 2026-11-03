import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { t } from "../../i18n";
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

test("Ajouter une carte stops at 24 cards and says why", async () => {
  const user = userEvent.setup();
  const card = (index: number) => ({
    id: `card-${index}`,
    icon: "star" as const,
    tint: "pink" as const,
    title: { fr: `Carte ${index}` },
    rows: [],
  });
  storeBlock("committee.contact", { cards: Array.from({ length: 24 }, (_, i) => card(i)) });
  editing();
  await renderWithSession(<CardsBlock blockKey="committee.contact" />, { route: "/committee" });

  // The server refuses a 25th card, so the editor is not offered one.
  const add = await screen.findByRole("button", { name: "Ajouter une carte" });
  expect(add).toHaveAttribute("aria-disabled", "true");
  expect(add).toHaveAccessibleDescription(t("blockEditor.cardsFull", { max: 24 }));
  expect(screen.getByText(t("blockEditor.cardsFull", { max: 24 }))).toBeVisible();

  await user.click(add);
  expect(screen.queryByRole("dialog")).toBeNull();
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

test("Rétablir in a card's editor restores that card alone", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const [instruments, schedule, age, ...rest] = BLOCKS["join.facts"].defaults().cards;
  const summer = { ...schedule!, title: { fr: "Horaires d’été" } };
  const older = { ...age!, title: { fr: "Dès 8 ans" } };
  // Stored in another order than the shipped one, so a reset by place would
  // land on the wrong card.
  storeBlock("join.facts", { cards: [older, instruments, summer, ...rest] });
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(await screen.findByRole("button", { name: "Modifier : Horaires d’été" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Horaires");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({ data: { cards: [older, instruments, schedule, ...rest] } });
});

test("a card the band added offers no Rétablir", async () => {
  const user = userEvent.setup();
  const extra = {
    id: "extra",
    icon: "star",
    tint: "pink",
    title: { fr: "Répétitions" },
    rows: [],
  };
  storeBlock("join.facts", { cards: [...BLOCKS["join.facts"].defaults().cards, extra] });
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(await screen.findByRole("button", { name: "Modifier : Répétitions" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Répétitions");
  expect(within(dialog).queryByRole("button", { name: "Rétablir l’original" })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  await user.click(screen.getByRole("button", { name: "Ajouter une carte" }));
  const adding = await screen.findByRole("dialog");
  expect(within(adding).queryByRole("button", { name: "Rétablir l’original" })).toBeNull();
});

test("deleting a card while another holds a refused number says which card", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  storeBlock("committee.contact", {
    cards: [
      {
        id: "place",
        icon: "map-pin",
        tint: "lime",
        title: { fr: "Lieu" },
        rows: [{ type: "text", text: { fr: "Werkhof" } }],
      },
      {
        id: "contact",
        icon: "phone",
        tint: "yellow",
        title: { fr: "Réservations" },
        rows: [{ type: "phone", label: { fr: "Appeler" }, number: "abc" }],
      },
    ],
  });
  editing();
  await renderWithSession(<CardsBlock blockKey="committee.contact" />, { route: "/committee" });

  await user.click(await screen.findByRole("button", { name: "Modifier : Lieu" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer la carte" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));

  expect(
    await within(dialog).findByText(t("blockEditor.otherCardInvalid", { title: "Réservations" })),
  ).toBeInTheDocument();
  expect(puts).toEqual([]);
});

test("page code goes inside a card, before or after its rows, and a wide block spans the page", async () => {
  await renderWithSession(
    <CardsBlock
      blockKey="committee.contact"
      layout="wide"
      slots={{
        contact: {
          beforeRows: <a href="/contact">Écrire au comité</a>,
          afterRows: <p>En attendant, écrivez-nous.</p>,
        },
        missing: { beforeRows: <p>Nowhere</p> },
      }}
    />,
    { route: "/committee" },
  );

  const card = screen
    .getByRole("heading", { name: "Contact des Canetons" })
    .closest("[data-slot='card']");
  const order = Array.from(card!.querySelectorAll("a, p"), (node) => node.textContent);
  expect(order[0]).toBe("Écrire au comité");
  expect(order[1]).toMatch(/^Pour réserver les Canetons :/);
  expect(order[2]).toBe("En attendant, écrivez-nous.");
  expect(screen.queryByText("Nowhere")).toBeNull();
  // One column at every width, so the single card is as wide as the page.
  expect(card!.parentElement).toHaveClass("grid");
  expect(card!.parentElement?.className).not.toMatch(/grid-cols/);
});

test("the default layout is the grid of up to three columns", async () => {
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  const card = screen.getByRole("heading", { name: "Horaires" }).closest("[data-slot='card']");
  expect(card!.parentElement).toHaveClass("sm:grid-cols-2", "lg:grid-cols-3");
});

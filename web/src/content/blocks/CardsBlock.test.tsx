import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { Toaster } from "../../components/ui/sonner";
import { t } from "../../i18n";
import {
  mockPhotoSlot,
  setMockPhotoSlot,
  setMockUser,
  setMockUserWithPermissions,
} from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts, storeBlock } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { EDIT_MODE_KEY } from "../EditMode";
import { BLOCKS } from "../registry";
import { tr } from "../translated";
import { cardSlot } from "../../images/photoSlots";
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

test("each card's chip opens that card, and its editor has no move buttons", async () => {
  const user = userEvent.setup();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Horaires");
  expect(within(dialog).queryByRole("button", { name: /Déplacer/ })).toBeNull();
});

test("moves a card after the next one and saves at once", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(
    <>
      <CardsBlock blockKey="join.facts" />
      <Toaster />
    </>,
    { route: "/join" },
  );

  await user.click(
    screen.getByRole("button", { name: "Déplacer « Instruments recherchés » après" }),
  );

  await expect.poll(() => puts).toHaveLength(1);
  const [instruments, schedule, ...rest] = BLOCKS["join.facts"].defaults().cards;
  expect(puts[0]?.body).toEqual({ data: { cards: [schedule, instruments, ...rest] } });
  expect((await screen.findAllByText("Modifié")).length).toBeGreaterThan(0);
  // The page follows the stored order, with no dialog in between.
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("Horaires"),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the first card has no 'avant' button and the last has no 'après' button", async () => {
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  const titles = BLOCKS["join.facts"].defaults().cards.map((card) => tr(card.title));
  const first = titles[0]!;
  const last = titles[titles.length - 1]!;
  expect(screen.queryByRole("button", { name: `Déplacer « ${first} » avant` })).toBeNull();
  expect(screen.getByRole("button", { name: `Déplacer « ${first} » après` })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: `Déplacer « ${last} » avant` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: `Déplacer « ${last} » après` })).toBeNull();
});

test("a second move waits for the first save, then builds on its result", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const [instruments, schedule, age, ...rest] = BLOCKS["join.facts"].defaults().cards;
  const after = { name: "Déplacer « Instruments recherchés » après" };
  // The first save is held back until the test lets it go; returning nothing
  // passes the request on to the default handler.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.put("/api/v1/blocks/:key", async () => {
      await held;
    }),
  );

  // The second tap lands before the first save has come back. Blocks are
  // written without an ETag, so what would go wrong is a list read from the
  // page before it shows the first move: it would undo it.
  await user.click(screen.getByRole("button", after));
  await expect.poll(() => puts).toHaveLength(1);
  // Marked, not disabled: a disabled button would drop the keyboard's focus.
  expect(screen.getByRole("button", after)).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("button", after)).toBeEnabled();
  await user.click(screen.getByRole("button", after));
  expect(puts).toHaveLength(1);
  release();
  await waitFor(() =>
    expect(screen.getByRole("button", after)).not.toHaveAttribute("aria-disabled", "true"),
  );

  await user.click(screen.getByRole("button", after));
  await expect.poll(() => puts).toHaveLength(2);
  expect(puts[0]?.body).toEqual({ data: { cards: [schedule, instruments, age, ...rest] } });
  expect(puts[1]?.body).toEqual({ data: { cards: [schedule, age, instruments, ...rest] } });
});

test("a card moved from the keyboard keeps focus on the same arrow of the moved card", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const after = { name: "Déplacer « Instruments recherchés » après" };

  screen.getByRole("button", after).focus();
  await user.keyboard("{Enter}");

  await expect.poll(() => puts).toHaveLength(1);
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { level: 2 })[1]).toHaveTextContent(
      "Instruments recherchés",
    ),
  );
  await waitFor(() => expect(screen.getByRole("button", after)).toHaveFocus());

  // So a second Enter carries on moving the same card.
  await user.keyboard("{Enter}");
  await expect.poll(() => puts).toHaveLength(2);
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { level: 2 })[2]).toHaveTextContent(
      "Instruments recherchés",
    ),
  );
  await waitFor(() => expect(screen.getByRole("button", after)).toHaveFocus());
});

test("a card moved to the front, where its arrow is gone, hands focus to its pencil", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  screen.getByRole("button", { name: "Déplacer « Horaires » avant" }).focus();
  await user.keyboard("{Enter}");

  await expect.poll(() => puts).toHaveLength(1);
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { level: 2 })[0]).toHaveTextContent("Horaires"),
  );
  expect(screen.queryByRole("button", { name: "Déplacer « Horaires » avant" })).toBeNull();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Modifier : Horaires" })).toHaveFocus(),
  );
});

test("the arrows follow the grid: left and right from sm, up and down on one column", async () => {
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const grid = screen.getByRole("button", { name: "Déplacer « Horaires » avant" });
  expect(grid.querySelector(".lucide-arrow-left")).toHaveClass("hidden", "sm:block");
  expect(grid.querySelector(".lucide-arrow-up")).toHaveClass("sm:hidden");
  const next = screen.getByRole("button", { name: "Déplacer « Horaires » après" });
  expect(next.querySelector(".lucide-arrow-right")).toHaveClass("hidden", "sm:block");
  expect(next.querySelector(".lucide-arrow-down")).toHaveClass("sm:hidden");
});

test("on a one-column list the arrows are up and down at every width", async () => {
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" layout="wide" />, { route: "/join" });
  const before = screen.getByRole("button", { name: "Déplacer « Horaires » avant" });
  expect(before.querySelector(".lucide-arrow-up")).not.toHaveClass("sm:hidden");
  expect(before.querySelector(".lucide-arrow-left")).toBeNull();
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

test("Dupliquer copies a card right after it, and the copy edits apart from the original", async () => {
  const user = userEvent.setup();
  editing();
  // A photo already placed for the card. The block itself goes through the
  // mocked store rather than `storeBlock`, so the page reads the saved list.
  setMockPhotoSlot(SCHEDULE_SLOT, { imageId: 1, label: "Horaires", path: "/join" });
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const puts = recordBlockPuts();

  await user.click(await screen.findByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("switch", { name: "Photo" }));
  await user.click(within(dialog).getByRole("button", { name: "Dupliquer" }));

  // The editor now shows the copy, its title ready to be typed over.
  const title = within(dialog).getByRole("textbox", { name: "Titre FR" });
  expect(title).toHaveValue("Horaires");
  expect(title).toHaveFocus();
  await user.clear(title);
  await user.type(title, "Horaires bis");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const shipped = BLOCKS["join.facts"].defaults().cards;
  const schedule = { ...shipped.find((card) => card.id === "schedule")!, photo: true };
  const saved = (puts[0]!.body as { data: { cards: { id: string }[] } }).data.cards;
  const copyId = saved[2]!.id;
  expect(copyId).not.toBe("schedule");
  expect(saved).toEqual([
    shipped[0],
    schedule,
    { ...schedule, id: copyId, title: { ...schedule.title, fr: "Horaires bis" } },
    ...shipped.slice(2),
  ]);

  // The copy shows its own empty slot; the original keeps its photo.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(
      document.querySelector(`[data-photo-pending='${cardSlot("join.facts", copyId)}']`),
    ).not.toBeNull(),
  );
  expect(mockPhotoSlot(SCHEDULE_SLOT)).not.toBeNull();
  expect(document.querySelectorAll("[data-photo-frame]")).toHaveLength(1);
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
  ).toEqual([
    "Instruments recherchés",
    "Horaires",
    "Horaires bis",
    "Critères d’âge",
    "Lieu",
    "Contacts",
  ]);
});

test("a grid at 24 cards offers no Dupliquer", async () => {
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

  // The chip's name also says the card has no German.
  await user.click(await screen.findByRole("button", { name: /^Modifier : Carte 0\b/ }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("button", { name: "Supprimer la carte" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Dupliquer" })).toBeNull();
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

  await user.click(
    await screen.findByRole("button", { name: "Modifier : Horaires d’été (sans allemand)" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Horaires");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({ data: { cards: [older, instruments, schedule, ...rest] } });
});

test("each card's pencil says when a text of that card has no German", async () => {
  const [instruments, schedule, ...rest] = BLOCKS["join.facts"].defaults().cards;
  const summer = { ...schedule!, title: { fr: "Horaires d’été" } };
  const added = { id: "added", tint: "lime", title: { fr: "Répétitions", de: "Proben" }, rows: [] };
  storeBlock("join.facts", { cards: [summer, instruments, ...rest, added] });
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  const marked = () =>
    [...document.querySelectorAll("[data-missing-german]")].map((chip) =>
      chip.getAttribute("aria-label"),
    );
  // The shipped cards all have their German, "Werkhof" included.
  await waitFor(() => expect(marked()).toEqual(["Modifier : Horaires d’été (sans allemand)"]));
  expect(screen.getByRole("button", { name: "Modifier : Répétitions" })).toBeVisible();
});

test("a card without an icon shows its title alone, with no tile", async () => {
  storeBlock("committee.contact", {
    cards: [{ id: "contact", tint: "yellow", title: { fr: "Nous joindre" }, rows: [] }],
  });
  await renderWithSession(<CardsBlock blockKey="committee.contact" />, { route: "/committee" });

  const heading = await screen.findByRole("heading", { name: "Nous joindre" });
  const card = heading.parentElement!;
  // The heading is the card's own child, so it starts at the card's edge.
  expect(card).toHaveAttribute("data-chip-scope");
  expect(card.querySelector("svg")).toBeNull();
  expect(card.querySelector(".bg-yellow")).toBeNull();
});

test("a card goes without an icon and gets one back, its colour kept", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="committee.contact" />, { route: "/committee" });
  const [shipped] = BLOCKS["committee.contact"].defaults().cards;

  await user.click(await screen.findByRole("button", { name: "Modifier : Contact des Canetons" }));
  let dialog = await screen.findByRole("dialog");
  const iconSwitch = within(dialog).getByRole("switch", { name: "Icône" });
  expect(iconSwitch).toBeChecked();
  await user.click(iconSwitch);
  // The colour tints only the icon's tile, so it goes with the icons.
  expect(within(dialog).queryByRole("radiogroup", { name: "Icône" })).toBeNull();
  expect(within(dialog).queryByRole("radiogroup", { name: "Couleur" })).toBeNull();
  // On again, the card gets back the icon it had.
  await user.click(iconSwitch);
  expect(within(dialog).getByRole("radio", { name: "Téléphone" })).toBeChecked();
  await user.click(iconSwitch);
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const withoutIcon = { ...shipped!, icon: undefined };
  expect(puts[0]?.body).toEqual({ data: { cards: [withoutIcon] } });
  expect(puts[0]?.body).not.toHaveProperty("data.cards.0.icon");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  // Out of the row it shared with the tile: the card's own child.
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Contact des Canetons" }).parentElement,
    ).toHaveAttribute("data-chip-scope"),
  );

  await user.click(screen.getByRole("button", { name: "Modifier : Contact des Canetons" }));
  dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("switch", { name: "Icône" })).not.toBeChecked();
  await user.click(within(dialog).getByRole("switch", { name: "Icône" }));
  // A card opened without an icon starts from the star, as a new card does.
  expect(within(dialog).getByRole("radio", { name: "Étoile" })).toBeChecked();
  expect(within(dialog).getByRole("radio", { name: "Jaune" })).toBeChecked();
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(2);
  expect(puts[1]?.body).toEqual({ data: { cards: [{ ...withoutIcon, icon: "star" }] } });
});

test("Rétablir brings back a shipped card without an icon as none", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const [godparents] = BLOCKS["band.godparents"].defaults().cards;
  expect(godparents).not.toHaveProperty("icon");
  storeBlock("band.godparents", { cards: [{ ...godparents!, icon: "star" }] });
  editing();
  await renderWithSession(<CardsBlock blockKey="band.godparents" layout="wide" />, {
    route: "/band",
  });

  await user.click(
    await screen.findByRole("button", { name: "Modifier : Le parrain et la marraine" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("radio", { name: "Étoile" })).toBeChecked();
  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  expect(within(dialog).getByRole("switch", { name: "Icône" })).not.toBeChecked();
  expect(within(dialog).queryByRole("radiogroup", { name: "Icône" })).toBeNull();
  expect(within(dialog).queryByRole("radiogroup", { name: "Couleur" })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  // Back to the shipped block, which is saved as no stored block at all.
  await expect.poll(() => puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({ data: null });
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

  await user.click(
    await screen.findByRole("button", { name: "Modifier : Répétitions (sans allemand)" }),
  );
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

  await user.click(await screen.findByRole("button", { name: "Modifier : Lieu (sans allemand)" }));
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

test("a card with a photo shows the slot named by its block and id, and others do not", async () => {
  storeBlock("join.facts", {
    cards: [
      { ...BLOCKS["join.facts"].defaults().cards[0]!, photo: true },
      BLOCKS["join.facts"].defaults().cards[1],
    ],
  });
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await screen.findByRole("heading", { name: "Instruments recherchés" });
  await waitFor(() =>
    expect(
      document.querySelector(`[data-photo-pending='${cardSlot("join.facts", "instruments")}']`),
    ).not.toBeNull(),
  );
  expect(document.querySelectorAll("[data-photo-pending]")).toHaveLength(1);
});

test("the Photo switch in the card editor turns the slot on and saves it", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  const toggle = within(dialog).getByRole("switch", { name: "Photo" });
  expect(toggle).not.toBeChecked();
  await user.click(toggle);
  expect(toggle).toBeChecked();
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const saved = (puts[0]!.body as { data: { cards: { id: string; photo?: boolean }[] } }).data
    .cards;
  expect(saved.find((card) => card.id === "schedule")?.photo).toBe(true);
  expect(saved.find((card) => card.id === "age")?.photo).toBeUndefined();
});

test("deleting a card that carries a photo leaves the page rendering", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  // Put a photo on the card first, through the editor, so the stored block has it.
  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  let dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("switch", { name: "Photo" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => puts).toHaveLength(1);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() =>
    expect(document.querySelector("[data-photo-pending='join.facts.schedule']")).not.toBeNull(),
  );

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer la carte" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));

  await expect.poll(() => puts).toHaveLength(2);
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Horaires" })).toBeNull());
  expect(screen.getByRole("heading", { name: "Lieu" })).toBeInTheDocument();
  expect(document.querySelector("[data-photo-pending='join.facts.schedule']")).toBeNull();
});

/** Every write the page sends, blocks and photo slots alike, in the order sent. */
function recordWrites() {
  const writes: Array<{ path: string; body: unknown }> = [];
  server.events.on("request:start", async ({ request }) => {
    const path = new URL(request.url).pathname;
    if (request.method === "PUT") writes.push({ path, body: await request.clone().json() });
  });
  return writes;
}

const SCHEDULE_SLOT = cardSlot("join.facts", "schedule");

/** The join cards as stored with a photo on the schedule card, and a photo placed in its slot. */
function scheduleWithPhoto() {
  storeBlock("join.facts", {
    cards: BLOCKS["join.facts"]
      .defaults()
      .cards.map((card) => (card.id === "schedule" ? { ...card, photo: true } : card)),
  });
  setMockPhotoSlot(SCHEDULE_SLOT, { imageId: 1, label: "Horaires", path: "/join" });
}

test("deleting a card whose photo is placed empties its slot once the list is saved", async () => {
  const user = userEvent.setup();
  editing();
  scheduleWithPhoto();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const writes = recordWrites();

  await user.click(await screen.findByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer la carte" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));

  // Otherwise the photo stays placed where nothing shows it, and the library
  // can neither delete it nor offer a page to take it off.
  await expect.poll(() => writes).toHaveLength(2);
  expect(writes[0]?.path).toBe("/api/v1/blocks/join.facts");
  expect(writes[1]).toEqual({
    path: `/api/v1/photo-slots/${SCHEDULE_SLOT}`,
    body: { imageId: null },
  });
  await waitFor(() => expect(mockPhotoSlot(SCHEDULE_SLOT)).toBeNull());
});

test("switching a card's photo off empties its slot", async () => {
  const user = userEvent.setup();
  editing();
  scheduleWithPhoto();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const writes = recordWrites();

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("switch", { name: "Photo" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => writes).toHaveLength(2);
  expect(writes[1]?.path).toBe(`/api/v1/photo-slots/${SCHEDULE_SLOT}`);
  await waitFor(() => expect(mockPhotoSlot(SCHEDULE_SLOT)).toBeNull());
});

test("a save that keeps a card's photo leaves its slot alone", async () => {
  const user = userEvent.setup();
  editing();
  scheduleWithPhoto();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const writes = recordWrites();

  await user.click(screen.getByRole("button", { name: "Déplacer « Horaires » avant" }));

  await expect.poll(() => writes).toHaveLength(1);
  // Long enough for a slot write to have followed the block's.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(writes.map((write) => write.path)).toEqual(["/api/v1/blocks/join.facts"]);
  expect(mockPhotoSlot(SCHEDULE_SLOT)).not.toBeNull();
});

test("an editor who cannot manage photos deletes the card and leaves the slot to the library", async () => {
  const user = userEvent.setup();
  setMockUserWithPermissions("demo.direction", ["content.manage", "events.view", "account.manage"]);
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  scheduleWithPhoto();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });
  const writes = recordWrites();

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer la carte" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));

  await expect.poll(() => writes).toHaveLength(1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(writes.map((write) => write.path)).toEqual(["/api/v1/blocks/join.facts"]);
});

test("a slot key built from an added card's id is a valid slot name", () => {
  const key = cardSlot("committee.contact", crypto.randomUUID());
  expect(key).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
});

/** The home page's band, as Home.tsx renders it: a list named by its heading. */
function Band() {
  return (
    <>
      <h2 id="discover">Découvrir</h2>
      <CardsBlock blockKey="home.cards" layout="band" links labelledBy="discover" />
    </>
  );
}

const flickrCard = {
  id: "photos",
  icon: "camera",
  tint: "yellow",
  title: { fr: "Photos" },
  rows: [
    { type: "text", text: { fr: "Nos albums" } },
    { type: "phone", label: { fr: "Appeler" }, number: "079 123 45 67" },
  ],
  to: "https://www.flickr.com/canetons",
};

test("each band card is one link to its page, tilted, as the home page shipped them", async () => {
  await renderWithSession(<Band />, { route: "/" });

  const list = screen.getByRole("list", { name: "Découvrir" });
  const links = within(list).getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/join",
    "/band",
    "/history",
    "/committee",
  ]);
  // The whole card is the link, so its name says where it goes and why.
  expect(links[0]).toHaveAccessibleName(
    "Nous rejoindre Les instruments recherchés, les horaires et les critères d’âge.",
  );
  const items = within(list).getAllByRole("listitem");
  expect(items[0]!.className).toContain("-rotate-[1.2deg]");
  expect(items[1]!.className).toContain("rotate-1");
  expect(screen.queryByRole("button")).toBeNull();
});

test("a card leading to another site opens it in a new tab, its rows as text", async () => {
  storeBlock("home.cards", { cards: [flickrCard] });
  await renderWithSession(<Band />, { route: "/" });

  const link = await screen.findByRole("link", { name: "Photos (nouvel onglet)" });
  expect(link).toHaveAttribute("href", "https://www.flickr.com/canetons");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer");
  // A link inside a link is invalid: the number shows, but dials nothing.
  expect(within(link).getByText(/079 123 45 67/)).toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(1);
});

test("a stored target no link may carry leaves the card as no link", async () => {
  storeBlock("home.cards", { cards: [{ ...flickrCard, to: "javascript:alert(1)" }] });
  await renderWithSession(<Band />, { route: "/" });

  expect(await screen.findByRole("heading", { name: "Photos" })).toBeInTheDocument();
  // The card is no link, so its phone row is one of its own again.
  expect(screen.getByRole("link")).toHaveAttribute("href", "tel:+41791234567");
});

test("a grid that offers no links ignores a stored target", async () => {
  storeBlock("join.facts", { cards: [{ ...flickrCard, to: "/band" }] });
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  expect(await screen.findByRole("heading", { name: "Photos" })).toBeInTheDocument();
  // Only the phone row's own link.
  expect(screen.getByRole("link")).toHaveAttribute("href", "tel:+41791234567");
});

test("in edit mode a band card is no link, so its chips sit in no link", async () => {
  editing();
  await renderWithSession(<Band />, { route: "/" });

  const chip = screen.getByRole("button", { name: "Modifier : Nous rejoindre" });
  expect(chip.closest("a")).toBeNull();
  expect(screen.queryByRole("link")).toBeNull();
  // Four across from lg, so the arrows point sideways from sm.
  expect(
    screen.getByRole("button", { name: "Déplacer « Nous rejoindre » après" }),
  ).toBeInTheDocument();
});

test("an editor adds a card that leads to another site", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<Band />, { route: "/" });

  await user.click(screen.getByRole("button", { name: "Ajouter une carte" }));
  const dialog = await screen.findByRole("dialog", { name: "Accueil · cartes" });
  await user.type(within(dialog).getByRole("textbox", { name: "Titre FR" }), "Photos");
  const toggle = within(dialog).getByRole("switch", { name: "Toute la carte est un lien" });
  expect(toggle).not.toBeChecked();
  await user.click(toggle);
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: "Destination" }),
    "Autre lien (https)",
  );
  const address = within(dialog).getByRole("textbox", { name: "Adresse du lien" });
  await user.clear(address);
  await user.type(address, "https://www.flickr.com/canetons");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const cards = (puts[0]!.body as { data: { cards: unknown[] } }).data.cards;
  expect(cards).toEqual([
    ...BLOCKS["home.cards"].defaults().cards,
    {
      id: expect.any(String),
      icon: "star",
      tint: "yellow",
      title: { fr: "Photos" },
      rows: [],
      to: "https://www.flickr.com/canetons",
    },
  ]);
});

test("a card whose link is switched off is saved without a target", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<Band />, { route: "/" });

  await user.click(screen.getByRole("button", { name: "Modifier : Le comité" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("combobox", { name: "Destination" })).toHaveValue("/committee");
  await user.click(within(dialog).getByRole("switch", { name: "Toute la carte est un lien" }));
  expect(within(dialog).queryByRole("combobox", { name: "Destination" })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts).toHaveLength(1);
  const cards = (puts[0]!.body as { data: { cards: Record<string, unknown>[] } }).data.cards;
  // Found by place, since the committee card's id reads like a role key to the lint.
  expect(cards[3]).toHaveProperty("title.fr", "Le comité");
  expect(cards[3]).not.toHaveProperty("to");
  expect(cards[0]).toHaveProperty("to", "/join");
});

test("the editor refuses a link that is not https", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderWithSession(<Band />, { route: "/" });

  await user.click(screen.getByRole("button", { name: "Modifier : Notre histoire" }));
  const dialog = await screen.findByRole("dialog");
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: "Destination" }),
    "Autre lien (https)",
  );
  const address = within(dialog).getByRole("textbox", { name: "Adresse du lien" });
  await user.clear(address);
  await user.type(address, "http://www.flickr.com/canetons");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await within(dialog).findByText(t("blockEditor.invalid"))).toBeInTheDocument();
  expect(puts).toEqual([]);
});

test("the editor of a grid without links offers no link switch", async () => {
  const user = userEvent.setup();
  editing();
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByRole("switch", { name: "Toute la carte est un lien" })).toBeNull();
});

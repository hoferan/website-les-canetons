import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { Toaster } from "../../components/ui/sonner";
import { notify } from "../../components/ui/toast";
import { cardSlot } from "../../images/photoSlots";
import { mockPhotoSlot, setMockBlock, setMockPhotoSlot, setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { CardsBlock } from "../blocks/CardsBlock";
import { HeroBlock } from "../blocks/HeroBlock";
import { EDIT_MODE_KEY } from "../EditMode";
import { BLOCKS } from "../registry";
import { tr } from "../translated";

afterEach(() => {
  server.events.removeAllListeners();
  // Sonner keeps its toasts in a module, and a Toaster mounted by the next
  // test would show this one's, whose undo is still live.
  notify.dismiss();
});

// Radix sizes a radio's hidden form input with ResizeObserver, which jsdom
// lacks.
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

const hero = BLOCKS["join.hero"].defaults();

const heroTitle = () => screen.getByRole("heading", { level: 1 }).textContent;

function editing() {
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
}

async function renderHero(route = "/join", locale: "fr" | "de-CH" = "fr") {
  await renderWithSession(
    <>
      <HeroBlock blockKey="join.hero" seed={5} />
      <Toaster />
    </>,
    { route, locale },
  );
}

async function renderCards() {
  await renderWithSession(
    <>
      <CardsBlock blockKey="join.facts" />
      <Toaster />
    </>,
    { route: "/join" },
  );
}

/** The "Modifié" toast's undo, which says "Annuler" and is not the dialogs' Annuler. */
async function undoFromToast(user: UserEvent) {
  const saved = (await screen.findByText("Modifié")).closest("[data-sonner-toast]");
  expect(saved).not.toBeNull();
  await user.click(within(saved as HTMLElement).getByRole("button", { name: "Annuler" }));
}

/** Every write the page sends, blocks and photo slots alike, in the order sent. */
function recordWrites() {
  const writes: Array<{ path: string; body: unknown }> = [];
  server.events.on("request:start", async ({ request }) => {
    const path = new URL(request.url).pathname;
    if (request.method === "PUT") writes.push({ path, body: await request.clone().json() });
  });
  return writes;
}

async function retitleHero(user: UserEvent, title: string) {
  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  const field = within(dialog).getByRole("textbox", { name: "Titre FR" });
  await user.clear(field);
  await user.type(field, title);
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

test("a dialog save over the shipped content is undone by writing null, in both languages", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderHero();

  await retitleHero(user, "Viens jouer avec nous");
  await waitFor(() => expect(heroTitle()).toBe("Viens jouer avec nous"));

  await undoFromToast(user);

  await expect.poll(() => puts).toHaveLength(2);
  expect(puts[1]).toEqual({ key: "join.hero", body: { data: null } });
  await waitFor(() => expect(heroTitle()).toBe(hero.title.fr));

  // The German page reads the same store, so it shows the shipped title too.
  cleanup();
  await renderHero("/de/join", "de-CH");
  await waitFor(() => expect(heroTitle()).toBe(hero.title.de));
});

test("a Rétablir l'original save is undone by writing the stored block back, in both languages", async () => {
  const user = userEvent.setup();
  const stored = {
    ...hero,
    title: { fr: "Viens jouer avec nous", de: "Spiel mit uns" },
  };
  setMockBlock("join.hero", stored);
  const puts = recordBlockPuts();
  editing();
  await renderHero();
  await waitFor(() => expect(heroTitle()).toBe("Viens jouer avec nous"));

  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Rétablir l’original" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await waitFor(() => expect(heroTitle()).toBe(hero.title.fr));
  expect(puts[0]).toEqual({ key: "join.hero", body: { data: null } });

  await undoFromToast(user);

  await expect.poll(() => puts).toHaveLength(2);
  // As stored, not as the page parsed it.
  expect(puts[1]).toEqual({ key: "join.hero", body: { data: stored } });
  await waitFor(() => expect(heroTitle()).toBe("Viens jouer avec nous"));

  cleanup();
  await renderHero("/de/join", "de-CH");
  await waitFor(() => expect(heroTitle()).toBe("Spiel mit uns"));
});

test("an arrow move is undone from its toast", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderCards();
  const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  const shipped = headings();

  await user.click(
    screen.getByRole("button", { name: "Déplacer « Instruments recherchés » après" }),
  );
  await waitFor(() => expect(headings()[0]).toBe("Horaires"));

  await undoFromToast(user);

  await expect.poll(() => puts).toHaveLength(2);
  expect(puts[1]).toEqual({ key: "join.facts", body: { data: null } });
  await waitFor(() => expect(headings()).toEqual(shipped));
});

const SCHEDULE_SLOT = cardSlot("join.facts", "schedule");

test("undoing the deletion of a card brings it back with its photo", async () => {
  const user = userEvent.setup();
  const stored = {
    cards: BLOCKS["join.facts"]
      .defaults()
      .cards.map((card) => (card.id === "schedule" ? { ...card, photo: true } : card)),
  };
  setMockBlock("join.facts", stored);
  setMockPhotoSlot(SCHEDULE_SLOT, { imageId: 1, label: "Horaires", path: "/join" });
  editing();
  await renderCards();
  const writes = recordWrites();

  await user.click(await screen.findByRole("button", { name: "Modifier : Horaires" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer la carte" }));
  const confirm = await screen.findByRole("alertdialog");
  await user.click(within(confirm).getByRole("button", { name: "Supprimer" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: "Horaires" })).toBeNull());
  await waitFor(() => expect(mockPhotoSlot(SCHEDULE_SLOT)).toBeNull());

  await undoFromToast(user);

  await expect.poll(() => writes).toHaveLength(4);
  expect(writes[2]).toEqual({ path: "/api/v1/blocks/join.facts", body: { data: stored } });
  expect(writes[3]).toEqual({
    path: `/api/v1/photo-slots/${SCHEDULE_SLOT}`,
    body: { imageId: 1, label: "Horaires", path: "/join" },
  });
  await waitFor(() => expect(mockPhotoSlot(SCHEDULE_SLOT)?.imageId).toBe(1));
  expect(await screen.findByRole("heading", { name: "Horaires" })).toBeInTheDocument();
  expect(await screen.findByRole("img", { name: "Horaires" })).toBeInTheDocument();
});

test("a failed undo says so and leaves the saved content", async () => {
  const user = userEvent.setup();
  editing();
  await renderHero();

  await retitleHero(user, "Viens jouer avec nous");
  server.use(http.put("/api/v1/blocks/:key", () => HttpResponse.error(), { once: true }));
  await undoFromToast(user);

  expect(await screen.findByText("L’annulation a échoué. Réessayez.")).toBeInTheDocument();
  expect(heroTitle()).toBe("Viens jouer avec nous");
});

test("a second save replaces the first one's toast, so only it can be undone", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  editing();
  await renderCards();
  const after = { name: "Déplacer « Instruments recherchés » après" };

  await user.click(screen.getByRole("button", after));
  await screen.findByText("Modifié");
  await waitFor(() =>
    expect(screen.getByRole("button", after)).not.toHaveAttribute("aria-disabled"),
  );
  await user.click(screen.getByRole("button", after));
  await expect.poll(() => puts).toHaveLength(2);
  const [instruments, schedule, age, ...rest] = BLOCKS["join.facts"].defaults().cards;
  await waitFor(() =>
    expect(screen.getAllByRole("heading", { level: 2 })[2]).toHaveTextContent(
      tr(instruments!.title),
    ),
  );
  expect(screen.getAllByText("Modifié")).toHaveLength(1);

  await undoFromToast(user);

  await expect.poll(() => puts).toHaveLength(3);
  expect(puts[2]?.body).toEqual({ data: { cards: [schedule, instruments, age, ...rest] } });
});

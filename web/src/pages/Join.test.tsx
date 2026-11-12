import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import { BLOCKS } from "../content/registry";
import type { Card } from "../content/types";
import { setMockUser } from "../mocks/handlers";
import { cardPencil } from "../test/cardControls";
import { storeBlock } from "../test/renderBlockEditor";
import { renderWithSession } from "../test/renderWithSession";
import { Join } from "./Join";

test("says how to join, in French by default", async () => {
  await renderWithSession(<Join />, { route: "/join" });

  // A pattern, because the highlight splits the heading into text nodes and
  // the accessible name then carries an ordinary space where the catalogue
  // has a non-breaking one before the "?".
  expect(
    screen.getByRole("heading", { name: /^Tu veux commencer la guggen\s\?$/ }),
  ).toBeInTheDocument();
  expect(screen.getByText("Instruments recherchés")).toBeInTheDocument();
  expect(screen.getByText("Trompette")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "page de contact" })).toHaveAttribute("href", "/contact");
});

test("says how to join, in German", async () => {
  await renderWithSession(<Join />, { route: "/join", locale: "de-CH" });

  expect(
    screen.getByRole("heading", { name: "Willst du mit der Gugge anfangen?" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Gesuchte Instrumente")).toBeInTheDocument();
  expect(screen.getByText("Trompete")).toBeInTheDocument();
  // The two joining contacts are placeholders, one per seat.
  expect(screen.getAllByText(/Name und Nummer/)).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Kontaktseite" })).toHaveAttribute("href", "/de/contact");
});

/** The shipped cards, with the contacts card's rows replaced. */
function withContacts(rows: Card["rows"]) {
  const { cards } = BLOCKS["join.facts"].defaults();
  return {
    cards: cards.map((card) => (card.id === "contacts" ? { ...card, rows } : card)),
  };
}

function contact(name: string, number: string) {
  return { type: "phone" as const, label: { fr: name }, number, tbd: "join-contact" };
}

test("the two contact placeholders stay until the band stores its contacts", async () => {
  await renderWithSession(<Join />, { route: "/join" });

  expect(document.querySelectorAll("[data-tbd='join-contact']")).toHaveLength(2);
  expect(screen.getByText(/En attendant/)).toBeInTheDocument();
});

test("stored contacts replace the placeholders, one per line, with tel: links", async () => {
  storeBlock(
    "join.facts",
    withContacts([
      contact("Anne Dupont", "079 123 45 67"),
      contact("Marc Rossier", "026 555 12 34"),
    ]),
  );
  await renderWithSession(<Join />, { route: "/join" });

  expect(document.querySelectorAll("[data-tbd]")).toHaveLength(0);
  // "Meanwhile, write to us" belongs to the placeholders, and goes with them.
  expect(screen.queryByText(/En attendant/)).toBeNull();
  expect(screen.getByRole("link", { name: "079 123 45 67" })).toHaveAttribute(
    "href",
    "tel:+41791234567",
  );
  expect(screen.getByRole("link", { name: "026 555 12 34" })).toHaveAttribute(
    "href",
    "tel:+41265551234",
  );
  expect(screen.getByText(/Anne Dupont/)).toBeInTheDocument();
});

test("one stored number is enough to drop the meanwhile line", async () => {
  storeBlock(
    "join.facts",
    withContacts([contact("Anne Dupont", "079 123 45 67"), contact("", "")]),
  );
  await renderWithSession(<Join />, { route: "/join" });

  expect(document.querySelectorAll("[data-tbd='join-contact']")).toHaveLength(1);
  expect(screen.queryByText(/En attendant/)).toBeNull();
});

test("the instruments come one per line from the stored list", async () => {
  const { cards } = BLOCKS["join.facts"].defaults();
  storeBlock("join.facts", {
    cards: cards.map((card) =>
      card.id === "instruments"
        ? { ...card, rows: [{ type: "text", text: { fr: "Trompette\nTuba" } }] }
        : card,
    ),
  });
  await renderWithSession(<Join />, { route: "/join" });

  expect(screen.getByText("Tuba")).toBeInTheDocument();
  expect(screen.queryByText("Euphonium")).toBeNull();
});

test("the map link follows the stored place and address", async () => {
  const { cards } = BLOCKS["join.facts"].defaults();
  storeBlock("join.facts", {
    cards: cards.map((card) =>
      card.id === "place"
        ? {
            ...card,
            rows: [
              {
                type: "address",
                label: { fr: "Salle Saint-Pierre" },
                address: "Rue X 1, 1700 Fribourg",
              },
            ],
          }
        : card,
    ),
  });
  await renderWithSession(<Join />, { route: "/join" });

  const link = screen.getByRole("link", { name: "Salle Saint-Pierre" });
  expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(
    "Salle Saint-Pierre, Rue X 1, 1700 Fribourg",
  );
});

test("the stored hero replaces the heading and the intro", async () => {
  storeBlock("join.hero", { title: { fr: "Viens jouer avec nous" }, intro: { fr: "Le samedi." } });
  await renderWithSession(<Join />, { route: "/join" });

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Viens jouer avec nous");
  expect(screen.getByText("Le samedi.")).toBeInTheDocument();
});

test("in edit mode the hero and every card carry a chip", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Join />, { route: "/join" });

  expect(
    await screen.findByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: cardPencil("Contacts") })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /^Modifier : / })).toHaveLength(6);
});

test("a visitor gets no chip", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  await renderWithSession(<Join />, { route: "/join" });

  expect(screen.queryByRole("button", { name: /^Modifier/ })).toBeNull();
});

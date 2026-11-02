import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
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
  // The two joining contacts are placeholders (see Join.tsx), one per seat.
  expect(screen.getAllByText(/Name und Nummer/)).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Kontaktseite" })).toHaveAttribute("href", "/contact");
});

/** Serves the band's stored texts, as GET /texts would. */
function storedTexts(rows: Array<{ key: string; fr: string | null; de: string | null }>) {
  server.use(
    http.get("/api/v1/texts", () =>
      HttpResponse.json({
        data: rows.map((row) => ({ ...row, updatedAt: "2026-11-02T10:00:00+00:00" })),
        meta: { total: rows.length, limit: 500, offset: 0 },
      }),
    ),
  );
}

test("the two contact placeholders stay until the band stores its contacts", async () => {
  await renderWithSession(<Join />, { route: "/join" });

  expect(document.querySelectorAll("[data-tbd='join-contact']")).toHaveLength(2);
});

test("stored contacts replace the placeholders, one per line, with tel: links", async () => {
  storedTexts([
    {
      key: "join.contactsList",
      fr: "Anne Dupont : 079 123 45 67\nMarc Rossier : 026 555 12 34",
      de: "Anne Dupont : 079 123 45 67\nMarc Rossier : 026 555 12 34",
    },
  ]);
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
});

test("the instruments come one per line from a single list", async () => {
  storedTexts([{ key: "join.facts.instruments.list", fr: "Trompette\nTuba", de: null }]);
  await renderWithSession(<Join />, { route: "/join" });

  expect(screen.getByText("Tuba")).toBeInTheDocument();
  expect(screen.queryByText("Euphonium")).toBeNull();
});

test("the map link follows the stored place and address", async () => {
  storedTexts([
    { key: "join.locationPlace", fr: "Salle Saint-Pierre", de: "Salle Saint-Pierre" },
    { key: "join.locationAddress", fr: "Rue X 1, 1700 Fribourg", de: "Rue X 1, 1700 Fribourg" },
  ]);
  await renderWithSession(<Join />, { route: "/join" });

  const link = screen.getByRole("link", { name: "Salle Saint-Pierre" });
  expect(decodeURIComponent(link.getAttribute("href") ?? "")).toContain(
    "Salle Saint-Pierre, Rue X 1, 1700 Fribourg",
  );
});

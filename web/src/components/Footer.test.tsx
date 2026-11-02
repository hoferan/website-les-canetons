import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";
import { EDIT_MODE_KEY } from "../texts/EditMode";

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

test("the band's name in the footer and the header follows the stored name", async () => {
  storedTexts([{ key: "site.name", fr: "Les Petits Canards", de: "Les Petits Canards" }]);
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  expect(within(footer).getByText("Les Petits Canards")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Les Petits Canards" }).length).toBeGreaterThan(0);
});

test("a network whose link was emptied disappears from the nav and the footer", async () => {
  // Blank, as the dialog never stores it: a row written by another client.
  server.use(
    http.get("/api/v1/texts", () =>
      HttpResponse.json({
        data: [
          {
            key: "site.instagramUrl",
            fr: " ",
            de: " ",
            updatedAt: "2026-11-02T10:00:00+00:00",
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
  await renderWithSession(<AppRoutes />, { route: "/join" });

  expect(screen.queryAllByRole("link", { name: /Instagram/ })).toHaveLength(0);
  expect(screen.getAllByRole("link", { name: /Facebook/ }).length).toBeGreaterThan(0);
});

test("a stored link replaces the network's address everywhere", async () => {
  storedTexts([
    {
      key: "site.facebookUrl",
      fr: "https://www.facebook.com/lespetitscanards",
      de: "https://www.facebook.com/lespetitscanards",
    },
  ]);
  await renderWithSession(<AppRoutes />, { route: "/join" });

  for (const link of screen.getAllByRole("link", { name: /Facebook/ })) {
    expect(link).toHaveAttribute("href", "https://www.facebook.com/lespetitscanards");
  }
});

test("an editor cannot store a link that is not https", async () => {
  const user = userEvent.setup();
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<AppRoutes />, { route: "/join" });

  const footer = screen.getByRole("contentinfo");
  await user.click(within(footer).getByRole("button", { name: "Modifier le texte : Instagram" }));
  const field = within(await screen.findByRole("dialog")).getByLabelText("Texte");
  await user.clear(field);
  await user.type(field, "instagram.com/autre");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enregistrer" }));

  expect(await within(screen.getByRole("dialog")).findByText(/https:\/\//)).toBeInTheDocument();
});

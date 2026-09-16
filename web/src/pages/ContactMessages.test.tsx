import { HttpResponse, http } from "msw";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { ContactMessages } from "./ContactMessages";

/**
 * Every assertion here depends on the archive having arrived, so the helper
 * waits for it rather than each test remembering to. `demo.direction` holds
 * both `messages.view` and `messages.manage` — the two-permission tests below
 * switch to `demo.committee`, which holds view alone.
 */
async function renderArchive(route = "/contact-messages") {
  setMockUser("demo.direction");
  const result = await renderWithSession(<ContactMessages />, { route });
  await screen.findAllByText("Dupasquier");
  return result;
}

function table() {
  return within(screen.getByTestId("messages-table"));
}

function cards() {
  return within(screen.getByTestId("messages-cards"));
}

/**
 * The expanded message. Scoped, because the same subject or preview text
 * also appears in the row it was opened from — both the card and the table
 * render it, and jsdom applies no CSS to hide either.
 */
function panel() {
  return within(screen.getByTestId("message-panel"));
}

test("lists the messages newest first", async () => {
  await renderArchive();

  // The mock seeds id 3 (Dupasquier) newest, then 2 (Rossier), then 1
  // (Chappuis) — the server's own order, which rowsOf() must not disturb.
  expect(
    table()
      .getAllByTestId("message-last-name")
      .map((cell) => cell.textContent),
  ).toEqual(["Dupasquier", "Rossier", "Chappuis"]);
});

test("renders an empty state when nothing has been sent", async () => {
  server.use(
    http.get("/api/v1/contact-messages", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );
  setMockUser("demo.direction");
  await renderWithSession(<ContactMessages />, { route: "/contact-messages" });

  // Read like the normal case, not an error: no role="alert", no "erreur".
  const empty = await screen.findByText(/aucun message/i);
  expect(empty).not.toHaveAttribute("role", "alert");
  expect(screen.queryByText(/erreur/i)).not.toBeInTheDocument();
});

test("expands the message named by ?open=", async () => {
  await renderArchive("/contact-messages?open=2");

  // Message 2 is Yannick Rossier's — its full body, not just the row's
  // truncated preview, must be on screen once the deep link has resolved.
  await screen.findByTestId("message-panel");
  expect(panel().getByText(/vous cherchez des musiciens/i)).toBeInTheDocument();
  expect(panel().getByRole("link", { name: "y.rossier@example.ch" })).toHaveAttribute(
    "href",
    "mailto:y.rossier@example.ch",
  );
});

test("hides the handle and delete controls from someone with only messages.view", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<ContactMessages />, { route: "/contact-messages" });
  await screen.findAllByText("Dupasquier");

  await userEvent.click(table().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByTestId("message-panel");

  expect(panel().getByText("Prestation pour un mariage")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Marquer comme traité" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Rouvrir" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
});

test("marks a message handled and shows who did it", async () => {
  await renderArchive();

  // Open message 3 (Dupasquier), the top row, which starts out open.
  await userEvent.click(table().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByRole("button", { name: "Marquer comme traité" });

  await userEvent.click(screen.getByRole("button", { name: "Marquer comme traité" }));

  // The mock hands back the acting member's own display name.
  expect(await screen.findByText(/Traité par Dominique Direction, le/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Rouvrir" })).toBeInTheDocument();
});

test("the phone layout lists exactly the same people as the table", async () => {
  await renderArchive();

  expect(
    cards()
      .getAllByTestId("message-last-name")
      .map((cell) => cell.textContent),
  ).toEqual(
    table()
      .getAllByTestId("message-last-name")
      .map((cell) => cell.textContent),
  );
});

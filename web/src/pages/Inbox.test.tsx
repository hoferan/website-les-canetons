import { HttpResponse, http } from "msw";
import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { AppRoutes } from "../routes";
import { renderWithSession } from "../test/renderWithSession";
import { Inbox } from "./Inbox";

/**
 * The mock seeds two open contact messages, id 3 (Isabelle Dupasquier,
 * newest) and id 2 (Yannick Rossier), plus a handled one that `GET /inbox`
 * excludes. `demo.committee` holds `messages.view` without `messages.manage`.
 */
async function renderInbox(locale: Locale = "fr") {
  setMockUser("demo.committee");
  const result = await renderWithSession(<Inbox />, { route: "/inbox", locale });
  await screen.findAllByTestId("inbox-item");
  return result;
}

function items() {
  return within(screen.getByTestId("inbox-items"));
}

test("lists open items newest first", async () => {
  await renderInbox();

  expect(
    items()
      .getAllByTestId("inbox-item-title")
      .map((node) => node.textContent),
  ).toEqual(["Isabelle Dupasquier", "Yannick Rossier"]);

  // Never the machine token: `kind` is for the wire, not the screen.
  expect(screen.queryByText("contactMessage")).not.toBeInTheDocument();
  expect(screen.getAllByText("Message du site").length).toBe(2);
});

test("links each item to where it is dealt with", async () => {
  await renderInbox();

  // Each row deep-links to the archive with that message already open.
  expect(
    items()
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/contact-messages?open=3", "/contact-messages?open=2"]);
});

test("renders a calm empty state when nothing is waiting", async () => {
  server.use(
    http.get("/api/v1/inbox", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );
  setMockUser("demo.committee");
  await renderWithSession(<Inbox />, { route: "/inbox" });

  // Read like good news, not an error: no role="alert", no "erreur".
  const empty = await screen.findByText(/rien n.attend/i);
  expect(empty).not.toHaveAttribute("role", "alert");
  expect(screen.queryByText(/erreur/i)).not.toBeInTheDocument();
});

/** The nav badge stays hidden at zero; the next test pins the real count. */
test("shows no badge when the count is zero", async () => {
  server.use(http.get("/api/v1/inbox/summary", () => HttpResponse.json({ total: 0, counts: {} })));
  setMockUser("demo.committee");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  expect(
    await screen.findByRole("button", { name: "Compte de demo.committee" }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("inbox-badge")).not.toBeInTheDocument();
});

/**
 * The other half: a real count must reach the nav. The zero-count test alone
 * still passes when the badge never reads the summary and is always absent.
 */
test("shows the badge's count when something is waiting", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  const badge = await screen.findByTestId("inbox-badge");
  expect(badge).toHaveTextContent("2");
});

test("renders the inbox and its kind labels in German", async () => {
  // Hoisting kindLabel's lookup to module scope would freeze the French
  // labels at import; this fails then, because the French tests above import
  // the same module first.
  await renderInbox("de-CH");

  expect(screen.getByRole("heading", { level: 1, name: "Posteingang" })).toBeInTheDocument();
  expect(items().getAllByText("Nachricht von der Website").length).toBeGreaterThan(0);
  expect(items().queryByText("Message du site")).toBeNull();
});

test("the empty inbox says so in German", async () => {
  server.use(
    http.get("/api/v1/inbox", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );

  setMockUser("demo.committee");
  await renderWithSession(<Inbox />, { route: "/inbox", locale: "de-CH" });

  expect(
    await screen.findByText(
      "Nichts wartet auf eine Antwort. Der Posteingang ist auf dem neuesten Stand.",
    ),
  ).toBeInTheDocument();
});

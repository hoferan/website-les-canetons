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
 * The mock seeds two OPEN contact messages — id 3 (Isabelle Dupasquier,
 * newest) and id 2 (Yannick Rossier) — plus a third already handled, which
 * `GET /inbox` excludes on the server side. `demo.committee` holds
 * `messages.view` and nothing more, mirroring the archive's own tests.
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

  // Each row deep-links back to the archive with that message already open —
  // a way THROUGH to the work, not a second place to do it.
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

/**
 * THE BADGE'S GUARD, and the one Step 5's mutation check targets: see
 * task-11-report.md for both runs (red with the count severed, green
 * restored).
 */
test("shows no badge when the count is zero", async () => {
  server.use(http.get("/api/v1/inbox/summary", () => HttpResponse.json({ total: 0, counts: {} })));
  setMockUser("demo.committee");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  expect(await screen.findByRole("link", { name: /Boîte de réception/ })).toBeInTheDocument();
  expect(screen.queryByTestId("inbox-badge")).not.toBeInTheDocument();
});

/**
 * The other half of the same guard: a zero-count badge is invisible noise,
 * but a real count must actually reach the nav. Without this test, Step 5's
 * mutation (severing the badge's use of the summary) breaks nothing above —
 * the zero-badge test still passes when the badge is ALWAYS absent.
 */
test("shows the badge's count when something is waiting", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<AppRoutes />, { route: "/login" });

  const badge = await screen.findByTestId("inbox-badge");
  expect(badge).toHaveTextContent("2");
});

test("THE GERMAN WAS ALREADY WRITTEN AND WAS NEVER REACHED", async () => {
  // #151 translated every key this screen uses. It rendered French anyway,
  // because the component read `fr.inbox.*` directly — the catalogue object,
  // not i18next — so the locale could not reach it.
  //
  // The kind label is the sharp end: it was a module-scope
  // `Record<string, string>` snapshot of the FRENCH kinds, frozen at import,
  // so every row read "Message du site" on a German page.
  //
  // MUTATION TEST: hoist kindLabel's lookup back to module scope and this
  // fails, because the French tests above import the same module first.
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

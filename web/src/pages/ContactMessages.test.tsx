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

test("the close control keeps its French name once it is only an icon", async () => {
  await renderArchive("/contact-messages?open=2");
  await screen.findByTestId("message-panel");

  // Queried by accessible name on purpose. The button shows an X and no text,
  // so "Fermer" survives only in aria-label — drop it and this is an unlabelled
  // button that a screen reader announces as nothing, on the only way out of
  // the panel.
  await userEvent.click(panel().getByRole("button", { name: "Fermer" }));

  expect(screen.queryByTestId("message-panel")).not.toBeInTheDocument();
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

test("the heading count agrees with the filtered rows, not the whole archive", async () => {
  await renderArchive();

  // Unfiltered: the heading names the whole archive, all three seeded rows.
  expect(screen.getByTestId("message-count")).toHaveTextContent("3 messages");

  // The fixture seeds one handled message (Chappuis) among three, so
  // "Traités" leaves exactly one row on screen. The heading must say so
  // rather than repeat the archive's total of three.
  await userEvent.click(screen.getByRole("button", { name: "Traités" }));

  expect(table().getAllByTestId("message-last-name")).toHaveLength(1);
  expect(screen.getByTestId("message-count")).toHaveTextContent("1 sur 3 messages");
});

test("filtering to a status with nothing in it explains itself, not as an error", async () => {
  // Overrides the list wholesale, so the fixture is exactly "every message is
  // open" — no reliance on which of the three seeded rows happen to be
  // handled today. Filtering to "Traités" then has nothing to show.
  server.use(
    http.get("/api/v1/contact-messages", () =>
      HttpResponse.json({
        data: [
          {
            id: 1,
            firstName: "Sophie",
            lastName: "Chappuis",
            email: "sophie.chappuis@example.ch",
            subject: null,
            message: "Bonjour.",
            receivedAt: "2026-09-08T09:15:00+00:00",
            handledAt: null,
            handledBy: null,
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
  setMockUser("demo.direction");
  await renderWithSession(<ContactMessages />, { route: "/contact-messages" });
  await screen.findAllByText("Chappuis");

  await userEvent.click(screen.getByRole("button", { name: "Traités" }));

  const empty = await screen.findByText(/aucun message ne correspond/i);
  expect(empty).not.toHaveAttribute("role", "alert");
  // Distinct from the true-empty copy: there ARE messages, just none in this
  // filter.
  expect(screen.queryByText(/prêt à en recevoir/i)).not.toBeInTheDocument();
});

/**
 * MUTATION-TESTED GUARD (per docs/traps.md's standing rule): reintroduce the
 * "fetch a fresher tag immediately before the write" anti-pattern and confirm
 * this fails, then confirm it passes again. See task-10-report.md for both
 * runs.
 *
 * The scenario: open a message (the component's own read captures tag A),
 * then move the SERVER's stored tag to B by driving a second write through
 * the same mock store directly — exactly as if another committee member
 * acted first, and the same technique Members.test.tsx uses for the
 * equivalent roster guard. Clicking "Marquer comme traité" must still send
 * the PATCH with tag A: never a tag re-read at write time, which is the
 * whole point of a conditional write (web/src/api/ifMatch.ts).
 *
 * `server.events` — not a `server.use()` override — is what lets this
 * capture the header the browser actually sent without touching or
 * duplicating the handler's own staleness logic.
 */
test("writes the handled PATCH with the tag from the read the user saw, not a fresher one", async () => {
  await renderArchive();

  // Open message 3 (Dupasquier) — the component's own read, tag A.
  await userEvent.click(table().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByRole("button", { name: "Marquer comme traité" });

  // Move the server's stored tag for message 3, through the mock store
  // directly rather than through the component under test. `tagA` is read
  // independently here — nothing has changed the message since the
  // component's own read moments ago, so the two reads agree; this is what
  // the assertion below actually checks the PATCH against.
  const independentRead = await fetch("/api/v1/contact-messages/3");
  const tagA = independentRead.headers.get("ETag");
  expect(tagA).not.toBeNull();

  await fetch("/api/v1/contact-messages/3", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": tagA ?? "" },
    body: JSON.stringify({ handled: true }),
  });
  // The server's tag for message 3 is now B — different from A, since the
  // PATCH above changed handledAt/handledBy, which mockEntityTag hashes.

  let capturedIfMatch: string | null | undefined;
  const captureHeader = ({ request }: { request: Request }) => {
    if (request.method === "PATCH" && request.url.includes("/contact-messages/3")) {
      capturedIfMatch = request.headers.get("If-Match");
    }
  };
  server.events.on("request:start", captureHeader);

  try {
    await userEvent.click(screen.getByRole("button", { name: "Marquer comme traité" }));

    // THE LOAD-BEARING ASSERTION: the outgoing header is tag A, the read the
    // component itself performed — never tag B, the one a re-read just
    // before the write would have picked up.
    expect(capturedIfMatch).toBe(tagA);

    // The mock's own staleness enforcement surfaces this as a 412, since the
    // component's tag A no longer matches the server's B. Asserted too, but
    // it is not the half that catches the anti-pattern: a re-read immediately
    // before the write would send tag B and this would succeed instead of
    // refusing — passing every other test in this file while the header
    // assertion above is what would catch it.
    expect(await screen.findByText(/modifié cet élément entre-temps/i)).toBeInTheDocument();
  } finally {
    server.events.removeListener("request:start", captureHeader);
  }
});

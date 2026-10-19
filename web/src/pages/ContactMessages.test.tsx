import { HttpResponse, http } from "msw";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { problem, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { ContactMessages } from "./ContactMessages";

/**
 * Renders the archive and waits for it to arrive. `demo.direction` holds both
 * `messages.view` and `messages.manage`; the tests that need view alone use
 * `demo.committee`.
 */
async function renderArchive(route = "/contact-messages", locale: Locale = "fr") {
  setMockUser("demo.direction");
  const result = await renderWithSession(<ContactMessages />, { route, locale });
  await screen.findAllByText("Dupasquier");
  return result;
}

/** The archive's cards, the one layout at every width. */
function cards() {
  return within(screen.getByTestId("messages-cards"));
}

/**
 * The expanded message. Scoped, because the same subject or preview text also
 * appears in the row it was opened from.
 */
function panel() {
  return within(screen.getByTestId("message-panel"));
}

test("lists the messages newest first", async () => {
  await renderArchive();

  // The mock seeds id 3 (Dupasquier) newest, then 2 (Rossier), then 1
  // (Chappuis): the server's own order, which rowsOf() must not disturb.
  expect(
    cards()
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

  // Message 2 is Yannick Rossier's. Its full body, not the row's truncated
  // preview, must be on screen once the deep link has resolved.
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

  // The button shows only an X, so "Fermer" lives in aria-label alone, on the
  // only way out of the panel.
  await userEvent.click(panel().getByRole("button", { name: "Fermer" }));

  expect(screen.queryByTestId("message-panel")).not.toBeInTheDocument();
});

test("hides the handle and delete controls from someone with only messages.view", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<ContactMessages />, { route: "/contact-messages" });
  await screen.findAllByText("Dupasquier");

  await userEvent.click(cards().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByTestId("message-panel");

  expect(panel().getByText("Prestation pour un mariage")).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Supprimer" })).not.toBeInTheDocument();
});

/** The opened message's switch, by its visible label. */
function handledSwitch() {
  return panel().getByRole("switch", { name: "Traité" });
}

test("switching Traité on marks the message handled and shows who did it", async () => {
  await renderArchive();

  // Open message 3 (Dupasquier), the top row, which starts out open.
  await userEvent.click(cards().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByTestId("message-panel");
  expect(handledSwitch()).not.toBeChecked();

  await userEvent.click(handledSwitch());

  // The mock hands back the acting member's own display name.
  expect(await screen.findByText(/Traité par Dominique Direction, le/)).toBeInTheDocument();
  expect(handledSwitch()).toBeChecked();
  expect(cards().getAllByText("Traité")).toHaveLength(2);
});

test("switching Traité off reopens a handled message", async () => {
  await renderArchive();

  // Message 1 (Chappuis), the bottom row, is the one the mock seeds handled.
  await userEvent.click(cards().getAllByRole("button", { name: /Lire/ })[2]!);
  await screen.findByText(/Traité par/);
  expect(handledSwitch()).toBeChecked();

  await userEvent.click(handledSwitch());

  await expect.poll(() => screen.queryByText(/Traité par/)).toBeNull();
  expect(handledSwitch()).not.toBeChecked();
});

/**
 * Three guards. Without the `finally` that clears the optimistic value the
 * switch stays on after the refusal; without the panel's alert the refusal is
 * never read; without the early return while busy a second click turns the
 * switch off mid-save.
 */
test("a refused flip puts the switch back and says why in the panel", async () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.patch("/api/v1/contact-messages/:id", async () => {
      await held;
      return problem(412, "if_match_failed", "The If-Match header does not match");
    }),
  );
  await renderArchive();

  await userEvent.click(cards().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByTestId("message-panel");

  await userEvent.click(handledSwitch());

  // On while the write is in flight, and deaf to a second flip.
  expect(handledSwitch()).toBeChecked();
  expect(handledSwitch()).toHaveAttribute("aria-disabled", "true");
  expect(handledSwitch()).toBeEnabled();
  await userEvent.click(handledSwitch());
  expect(handledSwitch()).toBeChecked();

  release();

  expect(await panel().findByRole("alert")).toHaveTextContent(/modifié cet élément entre-temps/);
  expect(handledSwitch()).not.toBeChecked();
  expect(handledSwitch()).toHaveAttribute("aria-disabled", "false");
  expect(screen.queryByText(/Traité par/)).not.toBeInTheDocument();
});

test("the heading count agrees with the filtered rows, not the whole archive", async () => {
  await renderArchive();

  // Unfiltered: the heading names the whole archive, all three seeded rows.
  expect(screen.getByTestId("message-count")).toHaveTextContent("3 messages");

  // The fixture seeds one handled message (Chappuis) among three.
  await userEvent.click(screen.getByRole("button", { name: "Traités" }));

  expect(cards().getAllByTestId("message-last-name")).toHaveLength(1);
  expect(screen.getByTestId("message-count")).toHaveTextContent("1 sur 3 messages");
});

test("filtering to a status with nothing in it explains itself, not as an error", async () => {
  // Every message open, independent of the seeded rows, so "Traités" has
  // nothing to show.
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
  // Distinct from the true-empty copy: there are messages, none in this filter.
  expect(screen.queryByText(/prêt à en recevoir/i)).not.toBeInTheDocument();
});

/**
 * Guards against fetching a fresher tag just before the write.
 *
 * Open a message (the component's read captures tag A), then move the
 * server's stored tag to B with a second write through the mock store, as if
 * another committee member acted first (Members.test.tsx does the same for
 * the roster). Switching "Traité" on must still send tag A
 * (web/src/api/ifMatch.ts).
 *
 * `server.events`, not a `server.use()` override, captures the header that
 * was sent without duplicating the handler's staleness logic.
 */
test("writes the handled PATCH with the tag from the read the user saw, not a fresher one", async () => {
  await renderArchive();

  // Open message 3 (Dupasquier): the component's own read, tag A.
  await userEvent.click(cards().getAllByRole("button", { name: /Lire/ })[0]!);
  await screen.findByTestId("message-panel");

  // An independent read agrees with the component's, since nothing has
  // changed the message in between. The PATCH is checked against it.
  const independentRead = await fetch("/api/v1/contact-messages/3");
  const tagA = independentRead.headers.get("ETag");
  expect(tagA).not.toBeNull();

  await fetch("/api/v1/contact-messages/3", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": tagA ?? "" },
    body: JSON.stringify({ handled: true }),
  });
  // The server's tag is now B: the PATCH changed handledAt and handledBy,
  // which mockEntityTag hashes.

  let capturedIfMatch: string | null | undefined;
  const captureHeader = ({ request }: { request: Request }) => {
    if (request.method === "PATCH" && request.url.includes("/contact-messages/3")) {
      capturedIfMatch = request.headers.get("If-Match");
    }
  };
  server.events.on("request:start", captureHeader);

  try {
    await userEvent.click(handledSwitch());

    // The assertion that catches a re-read: tag A, never B.
    expect(capturedIfMatch).toBe(tagA);

    // The mock answers 412, since A no longer matches B.
    expect(await screen.findByText(/modifié cet élément entre-temps/i)).toBeInTheDocument();
  } finally {
    server.events.removeListener("request:start", captureHeader);
  }
});

test("the archive is German, and its count pluralises by the German rule", async () => {
  await renderArchive("/contact-messages", "de-CH");

  expect(screen.getByRole("heading", { level: 1, name: "Nachrichten" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Alle" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Offen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Erledigt" })).toBeInTheDocument();
});

test("the filtered count keeps its hand-replaced braces, in German", async () => {
  // contactMessages uses single braces replaced by hand, unlike the rest of
  // the catalogue's i18next `{{ }}`. Mixing the two styles inside one key
  // renders the braces on screen.
  await renderArchive("/contact-messages", "de-CH");

  await userEvent.click(screen.getByRole("button", { name: "Offen" }));

  const count = await screen.findByTestId("message-count");
  expect(count.textContent).toMatch(/^\d+ von \d+ Nachrichten?$/);
  expect(count.textContent).not.toContain("{");
});

test("a write that never reaches the API says so in German", async () => {
  // A dropped connection is not an ApiError, so useApiFormError shows the
  // screen's fallback message.
  server.use(http.patch("/api/v1/contact-messages/:id", () => HttpResponse.error()));
  await renderArchive("/contact-messages", "de-CH");

  await userEvent.click(cards().getAllByRole("button", { name: /Lesen/ })[0]!);
  await screen.findByTestId("message-panel");
  await userEvent.click(panel().getByRole("switch", { name: "Erledigt" }));

  expect(await panel().findByRole("alert")).toHaveTextContent(
    "Die Aktion konnte nicht ausgeführt werden.",
  );
});

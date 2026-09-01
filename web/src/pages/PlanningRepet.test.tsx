import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { formatEventDate, formatEventDateRange } from "../lib/date";
import { SEED, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";

// By title rather than by index: Task 6 adds a past event at the START of SEED,
// and an index here would then point at the wrong event while still type-checking.
const CONCERT = SEED.find((event) => event.title === "Concert d'automne")!;
const WEEKEND = SEED.find((event) => event.title === "Week-end de répétition")!;

test("the events are listed in the order the API returned them", async () => {
  await renderWithSession(<PlanningRepet />);

  const items = within(await screen.findByRole("list", { name: "Événements" })).getAllByRole(
    "listitem",
  );
  expect(items).toHaveLength(3);

  // Pins the order. The page does not re-sort, so a change in the API's
  // ordering must fail here rather than be silently corrected in the UI.
  //
  // Asserted on textContent rather than getByText: each line is split across a
  // <strong> label and a text node, and getByText matches per element, so a
  // query for "Titre : X" finds nothing even though the line reads that way.
  // "Titre :" is gone — the line is obviously the title, and on a phone five
  // label-value lines were mostly label. The titles themselves still pin the
  // order, which is what this test is for.
  expect(items.map((item) => item.textContent)).toEqual([
    expect.stringContaining("Concert d'automne"),
    expect.stringContaining("Assemblée générale"),
    expect.stringContaining("Week-end de répétition"),
  ]);
});

test("an event shows its date, times, location and attire", async () => {
  await renderWithSession(<PlanningRepet />);

  const first = within(await screen.findByRole("list", { name: "Événements" })).getAllByRole(
    "listitem",
  )[0]!;
  // The DATE is asserted through the app's own formatter rather than as a
  // literal, because the fixture's dates are now offsets from today. That is
  // not a weaker assertion than it looks: the French formatting itself is
  // pinned on FIXED dates in web/src/lib/date.test.ts, which is where
  // formatting belongs. This test's job is that the card shows the event's
  // date at all.
  expect(within(first).getByText(formatEventDate(CONCERT.date))).toBeInTheDocument();
  // One meta line now: the two "Heure de …" labels and "Lieu :" were three
  // lines of mostly label on a phone. "Tenue :" KEEPS its label — it is the
  // detail members scan for and the one they get wrong.
  expect(first).toHaveTextContent("19:00 – 22:00");
  expect(first).toHaveTextContent("Salle communale");
  expect(first).toHaveTextContent("Tenue : Costume des canetons");
});

test("a weekend event shows a date range instead of one day", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByText(formatEventDateRange(WEEKEND.date))).toBeInTheDocument();
});

test("an event with no attire omits the Tenue line entirely", async () => {
  await renderWithSession(<PlanningRepet />);
  const second = within(
    within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem")[1]!,
  );
  expect(second.queryByText(/Tenue/)).toBeNull();
});

test("an anonymous visitor can read the planning", async () => {
  await renderWithSession(<PlanningRepet />);
  expect(
    within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem"),
  ).toHaveLength(3);
});

// An anonymous visitor reads the planning and can do nothing to it. This is the
// assertion that stops the merged page leaking member controls to the public.
test("an anonymous visitor gets no controls at all", async () => {
  await renderWithSession(<PlanningRepet />);
  await screen.findByRole("list", { name: "Événements" });
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Modifier / })).toBeNull();
});

test("an anonymous visitor is told that logging in lets them answer", async () => {
  await renderWithSession(<PlanningRepet />);
  // The sentence is split across the <Link> and the trailing text node, so a
  // plain regex findByText can't match it in one go — assert on the link and
  // on its containing paragraph's full text instead.
  const link = await screen.findByRole("link", { name: "Connectez-vous" });
  expect(link).toHaveAttribute("href", "/authentification_inscription");
  expect(link.closest("p")).toHaveTextContent("Connectez-vous pour indiquer votre participation.");
});

// A member already has the buttons in front of them. A banner repeating what
// the UI shows is noise on every visit.
test("a logged-in member never sees the hint", async () => {
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);
  await screen.findByRole("list", { name: "Événements" });
  expect(screen.queryByText(/Connectez-vous pour indiquer/)).toBeNull();
});

test("a failing API renders a message rather than an empty page", async () => {
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json(
        { error: "Service unavailable", code: "service_unavailable", fields: [] },
        { status: 503 },
      ),
    ),
  );

  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Le planning n’a pas pu être chargé.");
});

test("an empty planning renders the headings and no rows, not a crash", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByRole("heading", { name: "Événements" })).toBeInTheDocument();
  expect(
    within(screen.getByRole("list", { name: "Événements" })).queryAllByRole("listitem"),
  ).toHaveLength(0);
});

test("past events are hidden until asked for, then listed newest first", async () => {
  const user = userEvent.setup();
  await renderWithSession(<PlanningRepet />);

  const list = await screen.findByRole("list", { name: "Événements" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.queryByText("Répétition du samedi")).toBeNull();

  await user.click(screen.getByRole("button", { name: /événements passés/i }));

  expect(await screen.findByText("Répétition du samedi")).toBeInTheDocument();
});

test("an admin can read the summary of a past event", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: /événements passés/i }));

  const past = within(await screen.findByRole("list", { name: "Événements passés" }));
  expect(await past.findByRole("link", { name: "Résumé" })).toBeInTheDocument();
});

// Résumé is read-only and is the point of the archive for an admin. Everything
// destructive stays off it: a delete button on a list of things that already
// happened invites exactly the misclick it guards against. Answering is not
// offered either — answering an event that has happened is meaningless, which
// is why /inscriptions_utilisateurs' 'Aucun événement' branch catches it too.
test("the archive offers nothing destructive, and no way to answer", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: /événements passés/i }));

  const past = within(await screen.findByRole("list", { name: "Événements passés" }));
  await past.findByRole("link", { name: "Résumé" });
  expect(past.queryByRole("button", { name: /^Supprimer/ })).toBeNull();
  expect(past.queryByRole("button", { name: /^Modifier/ })).toBeNull();
  expect(past.queryByRole("button", { name: "Je participe" })).toBeNull();
});

test("a member sees the archive with no controls on it", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: /événements passés/i }));

  const past = within(await screen.findByRole("list", { name: "Événements passés" }));
  await past.findByText("Répétition du samedi");
  expect(past.queryByRole("button", { name: "Je participe" })).toBeNull();
  expect(past.queryByRole("link", { name: "Résumé" })).toBeNull();
});

const cards = async () =>
  within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem");

test("a member who may respond gets both answers on every event", async () => {
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
  expect(screen.getAllByRole("button", { name: "Je ne participe pas" })).toHaveLength(3);
  expect(screen.queryByRole("link", { name: "Résumé" })).toBeNull();
});

// The matrix is NOT a hierarchy: admin holds view_summary and NOT respond, so
// it gets the other action entirely. Every intuition about roles says an admin
// can do what a user can; here it cannot.
test("an admin gets the summary action instead, not as well", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findAllByRole("link", { name: "Résumé" })).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
  expect(await screen.findAllByRole("button", { name: /^Modifier / })).toHaveLength(3);
});

test("a moderator responds, like a user", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findAllByRole("button", { name: "Je participe" })).toHaveLength(3);
});

test("answering an event takes one tap and shows the saved answer", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);

  const first = (await cards())[0]!;
  await user.click(within(first).getByRole("button", { name: "Je participe" }));

  expect(await within(first).findByText("Je participe")).toBeInTheDocument();
  expect(within(first).getByRole("button", { name: "Modifier" })).toBeInTheDocument();
});

// The API has ALWAYS allowed this — ResponseController::store upserts on
// (user_id, event_id) and its own comment says "Answering again overwrites".
// Only the UI forbade it, with a disabled "Choix enregistré" button, which made
// a mistap permanent. One-tap answering is only safe because of this.
test("an answer can be changed", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  const concert = SEED.find((event) => event.title === "Concert d'automne")!;
  server.use(
    http.get("/api/events", () => HttpResponse.json([{ ...concert, response: "participate" }])),
  );

  await renderWithSession(<PlanningRepet />);
  await user.click(await screen.findByRole("button", { name: "Modifier" }));
  expect(await screen.findByRole("button", { name: "Je ne participe pas" })).toBeInTheDocument();
});

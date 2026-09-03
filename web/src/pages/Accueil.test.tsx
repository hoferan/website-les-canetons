import { screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Accueil } from "./Accueil";

// THE COPY IS A CONDENSATION, NOT A NEW CLAIM. Every fact here is already
// published on /historique — created in October 2002, a "guggen d'enfants",
// aged 7 to 18, no need to read music, moniteurs teaching register by register
// at Saturday-morning rehearsals. Asserting the sentences here means a future
// edit that invents something has to change a test to do it.
test("the hero says what the band is, in one line and one sentence", async () => {
  await renderWithSession(<Accueil />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeVisible();

  // Fragments, not the whole sentence: it contains a non-breaking space before
  // its colon, and a test asserting the full string with an ordinary space
  // fails on two characters that look identical in the diff.
  //
  // "apprennent les morceaux registre par registre", not the bare "registre
  // par registre": the /canetons destination card's own description (added in
  // Task 5) also says "registre par registre", so the bare fragment is
  // ambiguous the moment DestinationCards renders on this page. Anchoring on
  // the surrounding words keeps this test pinned to the hero sentence.
  expect(screen.getByText(/De 7 à 18 ans/)).toBeInTheDocument();
  expect(screen.getByText(/pas besoin de connaître la musique/)).toBeInTheDocument();
  expect(screen.getByText(/apprennent les morceaux registre par registre/)).toBeInTheDocument();
  expect(screen.getByText(/répétitions du samedi matin/)).toBeInTheDocument();
});

// The head-count is deliberately absent. /historique says the band GREW TO
// "une quarantaine d'enfants" — a sentence about 2002-03, not a membership
// figure for today. Repeating it in the present tense on the front page would
// be both a new claim and a perishable one.
test("the hero claims no membership figure", async () => {
  await renderWithSession(<Accueil />);

  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByText(/quarantaine/)).not.toBeInTheDocument();
});

// The badge is the band's mark, and this is its ONLY placement on the site —
// it was in the footer too until 2026-09-03 and became wallpaper. If it is
// dropped while reworking the hero, nothing else on the site shows it.
test("the hero carries the band's badge", async () => {
  await renderWithSession(<Accueil />);

  expect(await screen.findByAltText("Le logo des Canetons de Fribourg")).toBeVisible();
});

// The split is on the CAPABILITY, not on being logged in. `user` and
// `moderator` may respond to events but hold no view_summary, so they see the
// same public half an anonymous visitor sees. Every intuition about roles says
// otherwise, which is exactly why this is pinned.
test("an anonymous visitor is invited to reserve", async () => {
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("link", { name: "S’inscrire au souper" })).toHaveAttribute(
    "href",
    "/signup",
  );
  expect(screen.getByText(/Amis et familles, réservez votre place/)).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Voir les inscriptions" })).not.toBeInTheDocument();
});

test("a member without view_summary sees the same invitation", async () => {
  setMockUser("demo.user");
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("link", { name: "S’inscrire au souper" })).toBeInTheDocument();
});

test("an admin is sent to the summary instead", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("link", { name: "Voir les inscriptions" })).toHaveAttribute(
    "href",
    "/signups_admin",
  );
  expect(screen.queryByRole("link", { name: "S’inscrire au souper" })).not.toBeInTheDocument();
});

// With the feature off, a server publishes no copy about an unannounced event.
// The card must not appear at all — not an empty one.
test("with the feature off there is no card", async () => {
  server.use(
    http.get("/api/config", () =>
      HttpResponse.json({ env: "dev", features: { souper_signup: false }, occasion: null }),
    ),
  );

  await renderWithSession(<Accueil />);

  // The hero is what proves the page rendered at all — which is the point of
  // asserting it here rather than only asserting the card's absence.
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeVisible();
  expect(screen.queryByRole("link", { name: "S’inscrire au souper" })).not.toBeInTheDocument();
  expect(screen.queryByText(/25 ans des Canetons/)).not.toBeInTheDocument();
});

test("the front page carries the next upcoming event", async () => {
  await renderWithSession(<Accueil />);

  expect(await screen.findByRole("heading", { name: "Prochain événement" })).toBeVisible();
  // A <p>, not a heading — EventCard's h3 is the date — and a straight
  // apostrophe, which is what the MSW fixture holds.
  expect(screen.getByText("Concert d'automne")).toBeVisible();
});

// The hero and the photo slot must survive the events query coming back empty
// (a 200 with no rows, not a failure). This is the page-level half of
// NextEvent's own coverage: that component renders nothing on an empty list,
// and this proves nothing else on the page went with it. The absence of the
// "Prochain événement" heading itself — and the failing-request case — are
// NextEvent's own claims, proven there against a query-state probe so the
// assertion cannot fire before the query settles; see
// "with no upcoming events the section is absent, not empty" and
// "a failing request renders nothing rather than an error" in
// NextEvent.test.tsx.
test("with no upcoming events the hero and the photo slot are still there", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  const { container } = await renderWithSession(<Accueil />);

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeVisible();
  expect(container.querySelector("[data-photo-pending]")).toBeInTheDocument();
});

// FOUR, and these four. The nav has seven live entries (three more — /cd,
// /sponsors, /multimedia — are hidden, see Layout.tsx); this is the curated
// shortlist a stranger wants first, and the test names the routes so a
// "tidy-up" that generates them from NAV fails here instead of silently
// turning the front door into a second navigation.
test("the front page offers four curated destinations", async () => {
  await renderWithSession(<Accueil />);

  // Visible, not just an accessible name: this is the section that was
  // screenshotted reading as a continuation of "Prochain événement" above it,
  // because its name lived only in aria-label and never on screen.
  expect(await screen.findByRole("heading", { name: "Découvrir les Canetons" })).toBeVisible();

  const list = screen.getByRole("list", { name: "Découvrir les Canetons" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(4);

  // List-scoped, not `screen`: Layout.tsx's nav has entries labelled "Les
  // canetons", "Contact Canetons" and "Événements", which the name-anchored
  // lookups this replaced would also match — scoping to `list` is what keeps
  // this assertion about the destination cards rather than about whatever
  // else happens to render alongside them. Reading hrefs in document order
  // also pins the order the spec set them in, which a name-keyed lookup does
  // not: shuffling DESTINATIONS would leave every `href(...)` call unchanged.
  expect(
    within(list)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual(["/commencement", "/canetons", "/planning_repet", "/comite_teamdirection"]);
});

import { screen } from "@testing-library/react";
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
  expect(screen.getByText(/De 7 à 18 ans/)).toBeInTheDocument();
  expect(screen.getByText(/pas besoin de connaître la musique/)).toBeInTheDocument();
  expect(screen.getByText(/registre par registre/)).toBeInTheDocument();
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

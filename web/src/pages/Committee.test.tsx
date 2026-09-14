import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMemberTitle, setMemberVisibility } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Committee } from "./Committee";

/**
 * The committee page, generated from the roster.
 *
 * A SEAT IS `committee_title`, NOT A ROLE. Camille holds the `committee` role,
 * which grants `registrations.view` and nothing else; what puts her on this
 * page is the free text beside it. The two are separate on purpose, and a test
 * that conflated them would pass while the page published an authorisation
 * decision as a job title.
 */
test("lists each seat with the person who holds it", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText("Responsable intendance")).toBeInTheDocument();
  expect(screen.getByText("Camille Committee")).toBeInTheDocument();
});

test("omits a member holding no seat", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  await screen.findByText("Responsable intendance");
  // Perrine plays and holds nothing. Four of the five seeded members are in
  // that position, so a page that listed the roster would be obvious here.
  expect(screen.queryByText(/Perrine/)).not.toBeInTheDocument();
});

test("omits somebody who has withdrawn their consent to appear", async () => {
  setMemberVisibility(4, false); // Camille, the one seat in the seeded roster.
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText(/les fonctions et les noms du comité/)).toBeInTheDocument();
  expect(screen.queryByText(/Camille/)).not.toBeInTheDocument();
});

/**
 * A committee nobody has been entered for says so as a GAP, not as a fact
 * about the band. "Aucun membre du comité" would be a claim; the band has a
 * committee, it has simply not been typed in yet.
 */
test("writes the gap out when no seat has been entered", async () => {
  setMemberTitle(4, "");
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText(/les fonctions et les noms du comité/)).toBeInTheDocument();
});

/** A blank title is no seat, because the roster form writes '' when cleared. */
test("treats a cleared title as no seat rather than as a blank one", async () => {
  setMemberTitle(4, "   ");
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText(/les fonctions et les noms du comité/)).toBeInTheDocument();
});

/**
 * The 2026-08-31 audit flagged comite@lescanetons.org appearing on page after
 * page. This one sends people to the form instead, which stores the message
 * for the committee and cannot be harvested.
 */
test("sends people to the contact form rather than publishing an address", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(screen.getByRole("link", { name: "Écrire au comité" })).toHaveAttribute(
    "href",
    "/contact",
  );
  expect(screen.queryByText(/@lescanetons\.org/)).not.toBeInTheDocument();
});

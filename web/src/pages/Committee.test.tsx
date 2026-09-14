import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMemberSeat, setMemberVisibility } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Committee } from "./Committee";

/**
 * The committee page, generated from the roster.
 *
 * A SEAT IS NOT A ROLE. Camille holds the `committee` role, which grants
 * `registrations.view` and nothing else; what puts her on this page is the
 * committee_functions row her member record points at. The two are separate on
 * purpose, and a test that conflated them would pass while the page published
 * an authorisation decision as a job title.
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
 * committee, it has simply not been entered yet.
 *
 * ONE WAY TO SAY "NOBODY" NOW. This used to be two tests, for '' and for
 * '   ' — the roster form wrote an empty string when somebody cleared the free
 * text field, so both the API and this mock had to read a blank as no seat. A
 * foreign key has one empty value.
 */
test("writes the gap out when nobody has been given a seat", async () => {
  setMemberSeat(4, null);
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText(/les fonctions et les noms du comité/)).toBeInTheDocument();
});

/**
 * THE REASON THE REFERENCE TABLE EXISTS, and the pair is chosen so that BOTH
 * orderings this replaced get it wrong.
 *
 * "Responsable prestations" outranks "Responsable caisse" (3 against 4) and
 * sorts after it alphabetically, and Player sorts after Committee by surname —
 * so a page ordering by the seat's own text, or by the member's name the way
 * this one did until 2026-09-14, both answer Committee first. A first draft of
 * this test paired Présidente with Responsable intendance, where rank and
 * alphabet happen to agree; the alphabetical mutation sailed straight through
 * it.
 */
test("prints the seats in the band's rank order, not alphabetically", async () => {
  setMemberSeat(2, 3); // Perrine Player, responsable prestations — rank 3.
  setMemberSeat(4, 4); // Camille Committee, responsable caisse — rank 4.
  await renderWithSession(<Committee />, { route: "/committee" });

  await screen.findByText("Responsable prestations");
  const seats = screen.getAllByRole("listitem").map((seat) => seat.textContent);

  expect(seats).toEqual([
    "Responsable prestationsPerrine Player",
    "Responsable caisseCamille Committee",
  ]);
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

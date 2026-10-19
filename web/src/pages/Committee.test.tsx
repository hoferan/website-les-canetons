import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMemberSeat, setMemberVisibility } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Committee } from "./Committee";

/**
 * A seat is not a role. Camille holds the `committee` role, which grants read
 * access to guest lists and the inbox; what puts her on this page is the
 * committee_functions row her member record points at.
 */
test("lists each seat with the person who holds it", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText("Responsable intendance")).toBeInTheDocument();
  expect(screen.getByText("Camille Committee")).toBeInTheDocument();
});

test("omits a member holding no seat", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  await screen.findByText("Responsable intendance");
  // Perrine plays and holds no seat, like most seeded members.
  expect(screen.queryByText(/Perrine/)).not.toBeInTheDocument();
});

test("omits somebody who has withdrawn their consent to appear", async () => {
  setMemberVisibility(4, false); // Camille, the one seat in the seeded roster.
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText(/les fonctions et les noms du comité/)).toBeInTheDocument();
  expect(screen.queryByText(/Camille/)).not.toBeInTheDocument();
});

/**
 * A committee nobody has been entered for says so as a gap, not as a fact
 * about the band.
 */
test("writes the gap out when nobody has been given a seat", async () => {
  setMemberSeat(4, null);
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByText(/les fonctions et les noms du comité/)).toBeInTheDocument();
});

/**
 * The pair is chosen so that both wrong orderings fail. "Responsable
 * prestations" outranks "Responsable caisse" (3 against 4) but sorts after it
 * alphabetically, and Player sorts after Committee by surname, so ordering by
 * the seat's text or by the member's name both put Committee first.
 */
test("prints the seats in the band's rank order, not alphabetically", async () => {
  setMemberSeat(2, 3); // Perrine Player, responsable prestations, rank 3.
  setMemberSeat(4, 4); // Camille Committee, responsable caisse, rank 4.
  await renderWithSession(<Committee />, { route: "/committee" });

  await screen.findByText("Responsable prestations");
  const seats = screen.getAllByRole("listitem").map((seat) => seat.textContent);

  expect(seats).toEqual([
    "Responsable prestationsPerrine Player",
    "Responsable caisseCamille Committee",
  ]);
});

/** The form stores the message for the committee and cannot be harvested. */
test("sends people to the contact form rather than publishing an address", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(screen.getByRole("link", { name: "Écrire au comité" })).toHaveAttribute(
    "href",
    "/contact",
  );
  expect(screen.queryByText(/@lescanetons\.org/)).not.toBeInTheDocument();
});

test("renders the page and the booking placeholder in German", async () => {
  await renderWithSession(<Committee />, { route: "/committee", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Der Vorstand" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Dem Vorstand schreiben" })).toHaveAttribute(
    "href",
    "/contact",
  );
  expect(screen.getByText(/Nummer für Auftritte/)).toBeInTheDocument();
});

test("writes the gap out in German when nobody has been given a seat", async () => {
  setMemberSeat(4, null);
  await renderWithSession(<Committee />, { route: "/committee", locale: "de-CH" });

  expect(await screen.findByText(/die Ämter und Namen des Vorstands/)).toBeInTheDocument();
});

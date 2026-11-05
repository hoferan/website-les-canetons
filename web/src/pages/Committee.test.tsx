import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { EDIT_MODE_KEY } from "../content/EditMode";
import { BLOCKS } from "../content/registry";
import {
  setMemberSeat,
  setMemberVisibility,
  setMockUser,
  setMockUserWithPermissions,
} from "../mocks/handlers";
import { storeBlock } from "../test/renderBlockEditor";
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

test("the booking number is a placeholder until the band stores one", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(document.querySelector("[data-tbd='booking-number']")).not.toBeNull();
});

test("a stored booking number replaces the placeholder in both languages, as a tel: link", async () => {
  const [card] = BLOCKS["committee.contact"].defaults().cards;
  storeBlock("committee.contact", {
    cards: [
      {
        ...card!,
        rows: card!.rows.map((row) =>
          row.type === "phone" ? { ...row, number: "026 123 45 67" } : row,
        ),
      },
    ],
  });
  const { unmount } = await renderWithSession(<Committee />, { route: "/committee" });
  expect(screen.getByRole("link", { name: "026 123 45 67" })).toHaveAttribute(
    "href",
    "tel:+41261234567",
  );
  expect(document.querySelector("[data-tbd='booking-number']")).toBeNull();
  unmount();

  await renderWithSession(<Committee />, { route: "/committee", locale: "de-CH" });
  expect(screen.getByRole("link", { name: "026 123 45 67" })).toBeInTheDocument();
});

test("the write link sits between the card's heading and the booking line", async () => {
  await renderWithSession(<Committee />, { route: "/committee" });

  const heading = screen.getByRole("heading", { name: "Contact des Canetons" });
  const write = screen.getByRole("link", { name: "Écrire au comité" });
  const booking = document.querySelector("[data-tbd='booking-number']")!;
  expect(heading.compareDocumentPosition(write) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(write.compareDocumentPosition(booking) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("in edit mode the hero and the contact card carry a chip", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(
    await screen.findByRole("button", { name: "Modifier : Comité · en-tête" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Modifier : Contact des Canetons" }),
  ).toBeInTheDocument();
});

test("in edit mode, the seats link to Membres for whoever may manage members", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Committee />, { route: "/committee" });

  expect(await screen.findByRole("link", { name: "Géré dans Membres" })).toHaveAttribute(
    "href",
    "/members",
  );
});

test("the Membres link is absent outside edit mode, and without members.manage", async () => {
  setMockUser("demo.direction");
  const { unmount } = await renderWithSession(<Committee />, { route: "/committee" });
  await screen.findByText("Responsable intendance");
  expect(screen.queryByRole("link", { name: /Géré dans/ })).toBeNull();
  unmount();

  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUserWithPermissions("demo.direction", ["content.manage", "events.manage"]);
  await renderWithSession(<Committee />, { route: "/committee" });
  await screen.findByText("Responsable intendance");
  expect(screen.getByRole("button", { name: "Modifier : Comité · en-tête" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Géré dans/ })).toBeNull();
});

test("the link says Verwaltet unter Mitglieder on the German page", async () => {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  await renderWithSession(<Committee />, { route: "/committee", locale: "de-CH" });

  expect(
    await screen.findByRole("link", { name: "Verwaltet unter Mitglieder" }),
  ).toBeInTheDocument();
});

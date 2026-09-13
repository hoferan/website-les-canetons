import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMemberVisibility } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Band } from "./Band";

/**
 * The band page, generated from the roster.
 *
 * The mocked roster mirrors DevSeeder: Nadia plays in Batteurs, Perrine in
 * Cloches, Bastien in Trompettes and teaches Batteurs, Camille in Trombones.
 * Dominique organises and plays in nothing, so she appears nowhere here — the
 * same absence that broke the attendance partition when it was assumed away.
 */
test("lists each register with the people who play in it", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const drums = await screen.findByRole("article", { name: "Batteurs" });
  expect(within(drums).getByText(/Nadia/)).toBeInTheDocument();
});

test("lists an instructor under the register they teach, not the one they play in", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  // Bastien plays trumpet and teaches the drummers. Both are true at once, and
  // the two columns behind them are separate for exactly this reason.
  const drums = await screen.findByRole("article", { name: "Batteurs" });
  expect(within(drums).getByText(/Moniteurs/)).toHaveTextContent("Bastien");

  const trumpets = screen.getByRole("article", { name: "Trompettes" });
  expect(within(trumpets).queryByText(/Moniteurs/)).not.toBeInTheDocument();
  expect(within(trumpets).getByText(/Bastien/)).toBeInTheDocument();
});

/**
 * THE CONSENT TEST, on the screen side. The API has its own; this one proves
 * the page renders whatever the API sends rather than the roster it might have
 * cached from somewhere else.
 */
test("drops somebody who has withdrawn their consent to appear", async () => {
  setMemberVisibility(2, false); // Perrine, in Cloches.
  await renderWithSession(<Band />, { route: "/band" });

  const bells = await screen.findByRole("article", { name: "Cloches" });
  expect(within(bells).queryByText(/Perrine/)).not.toBeInTheDocument();
  // And the register stays, with its gap written out.
  expect(within(bells).getByText(/à compléter/)).toBeInTheDocument();
});

/**
 * A register nobody has consented to appear in KEEPS ITS HEADING. Dropping it
 * would tell a visitor the band has no lyre, and it would let a reader infer
 * that a particular child said no.
 *
 * Mutation-tested: filtering empty registers out of the map fails this test
 * and no other.
 */
test("keeps a register whose members have all withheld consent", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const lyre = await screen.findByRole("article", { name: "Lyre" });
  expect(within(lyre).getByText(/à compléter/)).toBeInTheDocument();
});

/**
 * EVERY link in the index has to land on something, INCLUDING the registers
 * nobody has consented to appear in. Those are the two lists that can drift
 * apart — the index is built from the whole answer and the page body could
 * easily be built from a filtered one — and a link to an anchor that is not on
 * the page scrolls nowhere and throws nothing.
 */
test("offers a jump link per register, each landing on that register", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  const index = await screen.findByRole("navigation", { name: "Registres" });
  const links = within(index).getAllByRole("link");
  expect(links).toHaveLength(6);

  for (const link of links) {
    const anchor = link.getAttribute("href")?.slice(1) ?? "";
    const register = document.getElementById(anchor);
    expect(register, `the index links to #${anchor}, which is not on the page`).not.toBeNull();
    expect(register).toHaveAccessibleName(link.textContent ?? "");
  }

  // Lyre is the empty one in the seeded roster, and therefore the one a
  // filtered page body would drop.
  expect(within(index).getByRole("link", { name: "Lyre" })).toHaveAttribute("href", "#register-3");
});

/** Nothing about an account reaches this page. */
test("publishes first names and no account details", async () => {
  await renderWithSession(<Band />, { route: "/band" });

  await screen.findByRole("article", { name: "Cloches" });
  expect(screen.queryByText(/demo\.player/)).not.toBeInTheDocument();
  // The surname travels in the response, for the committee page; this page
  // renders one half of a name on purpose.
  expect(screen.queryByText(/Sansconnexion/)).not.toBeInTheDocument();
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";

import { GuestMenus } from "./GuestMenus";

const MENUS = [
  { value: "meat", label: "Viande", description: "Rôti de bœuf.", price: "CHF 45.–" },
  { value: "child", label: "Enfant", description: "Émincé de poulet.", price: "CHF 20.–" },
  { value: "vegetarian", label: "Végétarien", description: "Risotto.", price: "CHF 40.–" },
];

/** A tiny host, because the component is controlled and owns no state. */
function Host({ maxGuests = 30 }: { maxGuests?: number }) {
  const [menus, setMenus] = useState<string[]>(["meat"]);
  return <GuestMenus menus={menus} onChange={setMenus} options={MENUS} maxGuests={maxGuests} />;
}

const rows = () => screen.getByRole("list", { name: "Personnes" });

test("it starts with one person", () => {
  render(<Host />);
  expect(within(rows()).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.getByLabelText("Personne 1")).toHaveValue("meat");
});

test("adding a person appends a row and renumbers", async () => {
  render(<Host />);
  await userEvent.click(screen.getByRole("button", { name: /Ajouter une personne/ }));

  expect(within(rows()).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByLabelText("Personne 2")).toBeInTheDocument();
});

// Renumbering after a removal from the MIDDLE is the case a naive
// implementation gets wrong: keying rows by index leaves "Personne 3" behind.
test("removing the first of three renumbers the rest", async () => {
  render(<Host />);
  const add = screen.getByRole("button", { name: /Ajouter une personne/ });
  await userEvent.click(add);
  await userEvent.click(add);
  await userEvent.selectOptions(screen.getByLabelText("Personne 3"), "vegetarian");

  await userEvent.click(screen.getAllByRole("button", { name: "Retirer cette personne" })[0]!);

  const remaining = within(rows()).getAllByRole("listitem");
  expect(remaining).toHaveLength(2);
  expect(screen.getByLabelText("Personne 2")).toHaveValue("vegetarian");
  expect(screen.queryByLabelText("Personne 3")).not.toBeInTheDocument();
});

// The old JS had no cap at all: a 31st row made the round trip and came back as
// a generic "Échec de l'envoi" naming no cause.
test("the cap refuses another person, and says why", async () => {
  render(<Host maxGuests={2} />);
  await userEvent.click(screen.getByRole("button", { name: /Ajouter une personne/ }));

  const add = screen.getByRole("button", { name: /Ajouter une personne/ });
  await userEvent.click(add);

  expect(within(rows()).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText(/2 personnes au maximum/)).toBeInTheDocument();
});

// One person must not be removable to zero: `menus` may not be empty, and the
// server rejects an empty list with a message about a format.
test("the last person cannot be removed", () => {
  render(<Host />);
  expect(screen.queryByRole("button", { name: "Retirer cette personne" })).not.toBeInTheDocument();
});

test("it counts the people and the menus", async () => {
  render(<Host />);
  await userEvent.click(screen.getByRole("button", { name: /Ajouter une personne/ }));
  await userEvent.selectOptions(screen.getByLabelText("Personne 2"), "child");

  expect(screen.getByTestId("guest-total")).toHaveTextContent("2 personnes");
  expect(screen.getByTestId("guest-total")).toHaveTextContent("1 Viande");
  expect(screen.getByTestId("guest-total")).toHaveTextContent("1 Enfant");
});

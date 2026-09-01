import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { EventCard } from "./EventCard";

const EVENT = {
  date: "2026-09-20",
  title: "Concert d'automne",
  weekend: 0,
};

test("the date is the card's heading and the title sits under it", () => {
  render(<EventCard event={EVENT} />);
  expect(
    screen.getByRole("heading", { name: "dimanche 20 septembre 2026", level: 3 }),
  ).toBeInTheDocument();
  expect(screen.getByText("Concert d'automne")).toBeInTheDocument();
});

// The heading LEVEL is the assertion worth having: both pages already own an
// h1, and /inscriptions_admin an h2, so a card that emitted h2 would break the
// document outline on one page and not the other.
test("a weekend event's heading spans two days", () => {
  render(<EventCard event={{ ...EVENT, weekend: 1 }} />);
  expect(
    screen.getByRole("heading", {
      name: "dimanche 20 septembre 2026 au lundi 21 septembre 2026",
      level: 3,
    }),
  ).toBeInTheDocument();
});

test("children render as the card's body and actions as its footer", () => {
  render(
    <EventCard event={EVENT} actions={<button type="button">Modifier</button>}>
      <p>19:00 – 22:00</p>
    </EventCard>,
  );
  expect(screen.getByText("19:00 – 22:00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Modifier" })).toBeInTheDocument();
});

// The reason the actions are a SLOT and not absolutely positioned. The old
// EventActions was `absolute top-2 right-2`, and at 390px it rendered on top of
// the date -- "dimanche 20 se[Modifier]2(". A footer cannot overlap the heading
// at any width.
test("the actions are not absolutely positioned over the heading", () => {
  const { container } = render(
    <EventCard event={EVENT} actions={<button type="button">Supprimer</button>} />,
  );
  const footer = container.querySelector("[data-event-actions]")!;
  expect(footer.className).not.toContain("absolute");
});

test("it renders as a list item so it can sit in the events list", () => {
  render(
    <ul>
      <EventCard event={EVENT} />
    </ul>,
  );
  expect(within(screen.getByRole("listitem")).getByRole("heading", { level: 3 })).toBeTruthy();
});

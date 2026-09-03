import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test } from "vitest";

import { DestinationCards } from "./DestinationCards";

// No session and no query client: this component reads nothing. MemoryRouter
// only because <Link> needs a router context.
function renderCards() {
  return render(
    <MemoryRouter>
      <DestinationCards
        label="Où aller"
        destinations={[
          { to: "/canetons", title: "Les canetons", description: "Registre par registre." },
          { to: "/planning_repet", title: "Événements", description: "Les prochaines dates." },
        ]}
      />
    </MemoryRouter>,
  );
}

test("each card is a link to its own destination", () => {
  renderCards();

  expect(screen.getByRole("link", { name: /Les canetons/ })).toHaveAttribute("href", "/canetons");
  expect(screen.getByRole("link", { name: /Événements/ })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});

// Named, because the layout's nav is a list too: an unscoped listitem query
// counts nav items, which once turned four events into seventeen rows.
test("the list is named, and holds one item per destination", () => {
  renderCards();

  const list = screen.getByRole("list", { name: "Où aller" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
});

// The whole point of the fix: `label` used to be only an `aria-label` on the
// <ul>, a name a screen reader announced and nobody ever saw. Screenshotted,
// that made the cards read as a continuation of whatever section sat above
// them. This pins that the heading is now actually on screen, not just in the
// accessible-name tree.
test("the label renders as a visible heading", () => {
  renderCards();

  expect(screen.getByRole("heading", { name: "Où aller" })).toBeVisible();
});

test("the description is part of the link", () => {
  renderCards();

  // Matched as a fragment of the accessible NAME, not as separate text: what is
  // being pinned is that the description is inside the anchor. Do not assert
  // the joined string — in a browser the description span is a flex item,
  // blockified by the anchor's `flex-col`, and that is what makes the browser
  // compute a separator between the two texts in the accessible name. jsdom
  // loads no stylesheet at all, so it applies no such layout and the two texts
  // run together without a space. That is a jsdom artefact, not what a browser
  // computes, and pinning it would pin the artefact.
  expect(screen.getByRole("link", { name: /Registre par registre\./ })).toHaveAttribute(
    "href",
    "/canetons",
  );
});

import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { isoDaysFromToday } from "../mocks/handlers";
import { server } from "../mocks/node";
import { formatEventDate } from "../lib/date";
import { renderWithSession } from "../test/renderWithSession";
import { NextEvent } from "./NextEvent";

// The MSW fixture's first UPCOMING event: +20 days, "Concert d'automne",
// 19:00-22:00, Salle communale. The fixture also holds one event in the PAST
// (-9 days), which the endpoint's default filter drops — so this test fails if
// the component ever stops relying on that filter and takes row zero of
// everything.
test("it shows the next upcoming event, with its date, time and place", async () => {
  await renderWithSession(<NextEvent />);

  expect(await screen.findByRole("heading", { name: "Prochain événement" })).toBeVisible();
  // EventCard renders only the DATE as a heading (h3); the title sits in a
  // plain <p> beneath it (see EventCard.tsx), so this is a text query, not a
  // role query. And the apostrophe here is straight ('), matching the MSW
  // fixture's literal string (mocks/handlers.ts) verbatim — the SEED title was
  // typed with a plain apostrophe, unlike this file's own prose.
  expect(screen.getByText("Concert d'automne")).toBeVisible();

  // Computed, never a literal: the fixture's dates are offsets from today, so a
  // hardcoded date would be a time bomb that fails on some future Tuesday for
  // no discoverable reason.
  expect(screen.getByText(formatEventDate(isoDaysFromToday(20)))).toBeInTheDocument();

  expect(screen.getByText(/19:00 – 22:00/)).toBeInTheDocument();
  expect(screen.getByText(/Salle communale/)).toBeInTheDocument();

  expect(screen.getByRole("link", { name: "Voir tous les événements" })).toHaveAttribute(
    "href",
    "/planning_repet",
  );
});

// THE TEST THIS COMPONENT EXISTS TO SATISFY. An empty-state card reading "aucun
// événement" on a band's front page says "this band does nothing", which is
// worse than the section not being there. So the requirement is ABSENT, not
// empty — and "absent" is only provable by asserting on the container.
test("with no upcoming events the section is absent, not empty", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(<NextEvent />);

  const booted = await screen.findByTestId("booted");
  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(screen.queryByText(/aucun/i)).not.toBeInTheDocument();
  // Nothing at all — not a heading with an empty list under it.
  expect(booted).toBeEmptyDOMElement();
});

// The front page gained a live dependency, and this is the risk the spec names:
// if /api/events is slow or fails, the hero and the destinations must still be
// there. A failing query renders nothing rather than an alert — this is the one
// consumer of that endpoint where an error message would be pure noise, because
// the visitor did not ask for the schedule.
test("a failing request renders nothing rather than an error", async () => {
  server.use(
    http.get("/api/events", () =>
      HttpResponse.json(
        { error: "Server error", code: "server_error", fields: [] },
        { status: 500 },
      ),
    ),
  );

  await renderWithSession(<NextEvent />);

  const booted = await screen.findByTestId("booted");
  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(booted).toBeEmptyDOMElement();
});

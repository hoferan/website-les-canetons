import { waitFor, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { useEventIndex } from "../api/generated/endpoints";
import { isoDaysFromToday } from "../mocks/handlers";
import { server } from "../mocks/node";
import { formatEventDate } from "../lib/date";
import { renderWithSession } from "../test/renderWithSession";
import { NextEvent } from "./NextEvent";

// A sibling consumer of the SAME query (same key, same QueryClient — see
// renderWithSession), so it settles exactly when NextEvent's own
// useEventIndex() call does. `booted` only proves SessionProvider's
// config/user round-trip resolved; it says nothing about this component's
// query, which is why the two absence tests below wait on this instead.
function QueryProbe() {
  const events = useEventIndex();
  return <span data-testid="query-state">{events.isPending ? "pending" : "settled"}</span>;
}

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

  // Picking exactly the NEXT event — not the list — is this component's whole
  // reason to exist. The fixture has THREE upcoming events; a regression to
  // `events.data.data.map(...)` would still pass every assertion above (row
  // zero is still "Concert d'automne", just now alongside the other two), so
  // this has to check the list's shape and the other titles' absence directly.
  // Scoped to the named list, not a bare getAllByRole("listitem") — the
  // layout's nav is a list too, and an unscoped query once counted four events
  // as seventeen rows.
  const list = screen.getByRole("list", { name: "Prochain événement" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(screen.queryByText("Assemblée générale")).not.toBeInTheDocument();
  expect(screen.queryByText("Week-end de répétition")).not.toBeInTheDocument();
});

// THE TEST THIS COMPONENT EXISTS TO SATISFY. An empty-state card reading "aucun
// événement" on a band's front page says "this band does nothing", which is
// worse than the section not being there. So the requirement is ABSENT, not
// empty — and "absent" is only provable by asserting on the container.
test("with no upcoming events the section is absent, not empty", async () => {
  server.use(http.get("/api/events", () => HttpResponse.json([])));

  await renderWithSession(
    <>
      <div data-testid="subject">
        <NextEvent />
      </div>
      <QueryProbe />
    </>,
  );

  // `booted` (SessionProvider's own gate) resolving does not mean the events
  // query has: the component renders nothing while pending too, so asserting
  // right after `booted` cannot tell "empty" from "still loading". Wait for
  // the probe, which shares this query's cache entry, before asserting.
  await waitFor(() => expect(screen.getByTestId("query-state")).toHaveTextContent("settled"));

  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(screen.queryByText(/aucun/i)).not.toBeInTheDocument();
  // Nothing at all — not a heading with an empty list under it.
  expect(screen.getByTestId("subject")).toBeEmptyDOMElement();
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

  await renderWithSession(
    <>
      <div data-testid="subject">
        <NextEvent />
      </div>
      <QueryProbe />
    </>,
  );

  // Same reasoning as the empty-list test above: `booted` proves only the
  // session gate resolved, not that useEventIndex() has settled into its error
  // state. Without this wait an assertion could fire while the query is still
  // pending and pass for the wrong reason — as it did under a mutation that
  // rendered an alert only on isError.
  await waitFor(() => expect(screen.getByTestId("query-state")).toHaveTextContent("settled"));

  expect(screen.queryByRole("heading", { name: "Prochain événement" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByTestId("subject")).toBeEmptyDOMElement();
});

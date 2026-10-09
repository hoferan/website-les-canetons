import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { photoSlotUpdate } from "../api/generated/endpoints";
import type { EventResource } from "../api/generated/model";
import { EventCard } from "../events/EventCard";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Agenda } from "./Agenda";
import { EventEdit } from "./EventEdit";
import { EventNew } from "./EventNew";

/**
 * An event's poster (#228): picked in the event's form, saved into the photo
 * slot `event-{id}` by a write of its own after the event's, and shown on the
 * agenda and the planning straight from the event.
 */

const POSTER = {
  url: "/api/v1/images/poster-800.jpg",
  width: 800,
  height: 1131,
  srcset: "/api/v1/images/poster-480.jpg 480w, /api/v1/images/poster-800.jpg 800w",
};

/** Every event and poster write in order, each recorded before the mock answers it. */
function recordWrites(): { method: string; path: string; body: unknown }[] {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const record = async ({ request }: { request: Request }) => {
    const text = await request.clone().text();
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: text === "" ? null : (JSON.parse(text) as unknown),
    });
  };
  server.use(
    http.post("/api/v1/events", record),
    http.patch("/api/v1/events/:id", record),
    http.post("/api/v1/events/:id/publish", record),
    http.put("/api/v1/photo-slots/:slot", record),
  );
  return writes;
}

async function renderAt(route: string) {
  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/events" element={<p>planning</p>} />
      <Route path="/events/new" element={<EventNew />} />
      <Route path="/events/:id/edit" element={<EventEdit />} />
    </Routes>,
    { route },
  );
}

async function fillRequired() {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Titre"), "Concert annuel");
  await user.type(screen.getByLabelText("Lieu"), "Aula du Collège");
  await user.type(screen.getByLabelText("Date de début"), "2027-02-14");
  await user.type(screen.getByLabelText("Heure de début"), "20:00");
  await user.type(screen.getByLabelText("Heure de fin"), "22:00");
  return user;
}

test("a new event with a poster is saved, then its poster, then it is published", async () => {
  const writes = recordWrites();
  await renderAt("/events/new");
  const user = await fillRequired();

  await user.click(screen.getByRole("button", { name: "Choisir" }));
  await user.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));
  await user.click(screen.getByRole("button", { name: "Publier" }));

  await screen.findByText("planning");
  expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "POST /api/v1/events",
    "PUT /api/v1/photo-slots/event-10",
    "POST /api/v1/events/10/publish",
  ]);
  expect(writes[0]?.body).not.toHaveProperty("poster");
  // The label and page are how the library lists where the photo is used.
  expect(writes[1]?.body).toEqual({
    imageId: 1,
    label: "Affiche : Concert annuel",
    path: "/events/10/edit",
  });
});

test("removing the poster saves the event, then empties its slot", async () => {
  setMockUser("demo.direction");
  await photoSlotUpdate("event-1", { imageId: 1, label: null, path: null });
  const writes = recordWrites();
  await renderAt("/events/1/edit");

  const field = await screen.findByTestId("photo-field");
  expect(within(field).getByRole("img")).toBeInTheDocument();
  await userEvent.click(within(field).getByRole("button", { name: "Retirer" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  await screen.findByText("planning");
  expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "PATCH /api/v1/events/1",
    "PUT /api/v1/photo-slots/event-1",
  ]);
  expect(writes[1]?.body).toEqual({
    imageId: null,
    label: "Affiche : Répétition",
    path: "/events/1/edit",
  });
});

/**
 * The publish carries the tag the save handed out, from before the poster's
 * write. That holds only because the poster is not in the event's tag.
 */
test("a draft given a poster on its edit screen is published after it", async () => {
  const writes = recordWrites();
  await renderAt("/events/8/edit");

  const field = await screen.findByTestId("photo-field");
  await userEvent.click(within(field).getByRole("button", { name: "Choisir" }));
  await userEvent.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));
  await userEvent.click(screen.getByRole("button", { name: "Publier" }));

  await screen.findByText("planning");
  expect(writes.map((write) => `${write.method} ${write.path}`)).toEqual([
    "PATCH /api/v1/events/8",
    "PUT /api/v1/photo-slots/event-8",
    "POST /api/v1/events/8/publish",
  ]);
});

test("an untouched poster is not written at all", async () => {
  const writes = recordWrites();
  await renderAt("/events/1/edit");
  await screen.findByLabelText("Titre");
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  await screen.findByText("planning");
  expect(writes.map((write) => write.path)).toEqual(["/api/v1/events/1"]);
});

/**
 * MUTATION TEST: navigate to the planning when the poster's write fails, and
 * the organiser never learns the poster is missing.
 */
test("a poster that fails after its new event saved opens the saved event and says so", async () => {
  const writes = recordWrites();
  server.use(http.put("/api/v1/photo-slots/:slot", () => HttpResponse.json({}, { status: 503 })));
  await renderAt("/events/new");
  const user = await fillRequired();

  await user.click(screen.getByRole("button", { name: "Choisir" }));
  await user.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));
  await user.click(screen.getByRole("button", { name: "Enregistrer le brouillon" }));

  // The edit screen of the saved draft, so a second tap cannot make a second event.
  expect(
    await screen.findByText(
      "L’événement est enregistré, mais pas son affiche. Choisissez-la à nouveau, puis enregistrez.",
    ),
  ).toBeInTheDocument();
  expect(await screen.findByLabelText("Titre")).toHaveValue("Concert annuel");
  expect(screen.queryByText("planning")).toBeNull();
  expect(writes.filter((write) => write.method === "POST")).toHaveLength(1);
});

test("a poster that fails after an edit saved keeps the form open and says so", async () => {
  server.use(http.put("/api/v1/photo-slots/:slot", () => HttpResponse.json({}, { status: 503 })));
  await renderAt("/events/1/edit");

  const field = await screen.findByTestId("photo-field");
  await userEvent.click(within(field).getByRole("button", { name: "Choisir" }));
  await userEvent.click(await screen.findByRole("button", { name: "Le groupe au Carnaval 2026" }));
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByText(
      "L’événement est enregistré, mais pas son affiche. Choisissez-la à nouveau, puis enregistrez.",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText("planning")).toBeNull();

  // Saving again works: the form holds the tag of what the first save wrote.
  server.resetHandlers();
  await userEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
  await screen.findByText("planning");
});

test("the agenda shows a poster that opens at full size, and none where there is none", async () => {
  const start = new Date(Date.now() + 7 * 86400000);
  const end = new Date(start.getTime() + 2 * 3600000);
  const entry = (id: number, title: string, poster: typeof POSTER | null) => ({
    id,
    title,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    location: "Fribourg",
    poster,
    registrationOpen: false,
    tags: [],
  });
  server.use(
    http.get("/api/v1/agenda", () =>
      HttpResponse.json({
        data: [entry(1, "Concert annuel", POSTER), entry(2, "Cortège", null)],
        meta: { total: 2, limit: 500, offset: 0 },
      }),
    ),
  );
  await renderWithSession(<Agenda />, { route: "/agenda" });

  const poster = await screen.findByRole("link", { name: "Affiche : Concert annuel" });
  expect(poster).toHaveAttribute("href", POSTER.url);
  expect(within(poster).getByRole("img")).toHaveAttribute("srcset", POSTER.srcset);

  const bare = screen.getByText("Cortège").closest("li") as HTMLElement;
  expect(within(bare).queryByRole("img")).toBeNull();
});

test("the planning's card shows the event's poster", async () => {
  const event = {
    id: 3,
    title: "Concert annuel",
    tags: [],
    startsAt: "2027-02-14T19:00:00Z",
    endsAt: "2027-02-14T21:00:00Z",
    location: "Aula du Collège",
    poster: POSTER,
    publishedAt: "2026-10-01T10:00:00Z",
    attire: null,
    isPublic: true,
    answeredCount: null,
    answerableCount: null,
    guestCount: null,
    notes: null,
    registrationOpensAt: null,
    registrationClosesAt: null,
    registrationMaxGuests: null,
    takesRegistrations: false,
    myAttendance: null,
  } satisfies EventResource;
  await renderWithSession(<EventCard event={event} />);

  await waitFor(() =>
    expect(screen.getByRole("link", { name: "Affiche : Concert annuel" })).toHaveAttribute(
      "href",
      POSTER.url,
    ),
  );
});

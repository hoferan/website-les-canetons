import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { ContactMessages } from "./ContactMessages";
import { EventAttendance } from "./EventAttendance";
import { EventRegistrations } from "./EventRegistrations";
import { EventTags } from "./EventTags";
import { Inbox } from "./Inbox";
import { Media } from "./Media";
import { Members } from "./Members";
import { Registers } from "./Registers";
import { Roles } from "./Roles";

/**
 * Every list screen fails, and recovers, the same way (#388): the list's own
 * sentence in an alert, a Réessayer that loads it again in place, and no
 * "Chargement…" left behind. Read in both languages, since a missing German
 * key falls back to French silently.
 */
const SCREENS: {
  name: string;
  endpoint: string;
  route: string;
  element: ReactElement;
  failed: Record<Locale, string>;
}[] = [
  {
    name: "/members",
    endpoint: "/api/v1/members",
    route: "/members",
    element: <Members />,
    failed: {
      fr: "La liste des membres n’a pas pu être chargée.",
      "de-CH": "Die Mitgliederliste konnte nicht geladen werden.",
    },
  },
  {
    name: "/inbox",
    endpoint: "/api/v1/inbox",
    route: "/inbox",
    element: <Inbox />,
    failed: {
      fr: "La boîte de réception n’a pas pu être chargée.",
      "de-CH": "Der Posteingang konnte nicht geladen werden.",
    },
  },
  {
    name: "/contact-messages",
    endpoint: "/api/v1/contact-messages",
    route: "/contact-messages",
    element: <ContactMessages />,
    failed: {
      fr: "La liste des messages n’a pas pu être chargée.",
      "de-CH": "Die Nachrichtenliste konnte nicht geladen werden.",
    },
  },
  {
    name: "/event-tags",
    endpoint: "/api/v1/event-tags",
    route: "/event-tags",
    element: <EventTags />,
    failed: {
      fr: "Les catégories n'ont pas pu être chargées.",
      "de-CH": "Die Kategorien konnten nicht geladen werden.",
    },
  },
  {
    name: "/registers",
    endpoint: "/api/v1/sections",
    route: "/registers",
    element: <Registers />,
    failed: {
      fr: "Les pupitres n'ont pas pu être chargés.",
      "de-CH": "Die Register konnten nicht geladen werden.",
    },
  },
  {
    name: "/roles",
    endpoint: "/api/v1/roles",
    route: "/roles",
    element: <Roles />,
    failed: {
      fr: "Les rôles n’ont pas pu être chargés.",
      "de-CH": "Die Rollen konnten nicht geladen werden.",
    },
  },
  {
    name: "/media",
    endpoint: "/api/v1/images",
    route: "/media",
    element: <Media />,
    failed: {
      fr: "La bibliothèque n’a pas pu être chargée.",
      "de-CH": "Die Bibliothek konnte nicht geladen werden.",
    },
  },
  {
    name: "/events/:id/attendance",
    endpoint: "/api/v1/events/:id/attendance",
    route: "/events/7/attendance",
    element: (
      <Routes>
        <Route path="/events/:id/attendance" element={<EventAttendance />} />
      </Routes>
    ),
    failed: {
      fr: "La liste n’a pas pu être chargée.",
      "de-CH": "Die Liste konnte nicht geladen werden.",
    },
  },
  {
    name: "/events/:id/registrations",
    endpoint: "/api/v1/events/:id/registrations",
    route: "/events/7/registrations",
    element: (
      <Routes>
        <Route path="/events/:id/registrations" element={<EventRegistrations />} />
      </Routes>
    ),
    failed: {
      fr: "La liste n’a pas pu être chargée.",
      "de-CH": "Die Liste konnte nicht geladen werden.",
    },
  },
];

const RETRY: Record<Locale, string> = { fr: "Réessayer", "de-CH": "Erneut versuchen" };
const LOADING: Record<Locale, string> = { fr: "Chargement…", "de-CH": "Wird geladen…" };

const errorState = () => document.querySelector('[data-state-message="error"]');
const loadingState = () => document.querySelector('[data-state-message="loading"]');

describe.each(SCREENS)("$name", (screenUnderTest) => {
  test.each(["fr", "de-CH"] as const)(
    "a failed load says so in %s, and Réessayer loads it in place",
    async (locale) => {
      const user = userEvent.setup();
      let down = true;
      server.use(
        http.get(screenUnderTest.endpoint, () => (down ? HttpResponse.error() : undefined)),
      );

      setMockUser("demo.direction");
      await renderWithSession(screenUnderTest.element, { route: screenUnderTest.route, locale });

      await waitFor(() => expect(errorState()).not.toBeNull());
      const alert = errorState()?.querySelector('[role="alert"]');
      expect(alert).toHaveTextContent(screenUnderTest.failed[locale]);
      // Nothing still claims to be loading once the request has failed.
      expect(screen.queryByText(LOADING[locale])).toBeNull();

      down = false;
      await user.click(screen.getByRole("button", { name: RETRY[locale] }));

      await waitFor(() => expect(errorState()).toBeNull());
      await waitFor(() => expect(loadingState()).toBeNull());
      expect(screen.queryByText(screenUnderTest.failed[locale])).toBeNull();
    },
  );
});

const NOTHING = { data: [], meta: { total: 0, limit: 500, offset: 0 } };

test("a failed roster puts Réessayer one Tab after the filters", async () => {
  const user = userEvent.setup();
  server.use(http.get("/api/v1/members", () => HttpResponse.error()));

  setMockUser("demo.direction");
  await renderWithSession(<Members />, { route: "/members" });
  await waitFor(() => expect(errorState()).not.toBeNull());

  // The role filter is the last of the three.
  screen.getByRole("combobox", { name: "Rôle" }).focus();
  await user.tab();

  expect(screen.getByRole("button", { name: "Réessayer" })).toHaveFocus();
});

test("an empty list of categories says so above the form that adds one", async () => {
  server.use(http.get("/api/v1/event-tags", () => HttpResponse.json(NOTHING)));

  setMockUser("demo.direction");
  await renderWithSession(<EventTags />, { route: "/event-tags" });

  expect(await screen.findByText("Aucune catégorie pour l'instant.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Nouvelle catégorie" })).toBeInTheDocument();
});

test("an empty list of registers says so, in German", async () => {
  server.use(http.get("/api/v1/sections", () => HttpResponse.json(NOTHING)));

  setMockUser("demo.direction");
  await renderWithSession(<Registers />, { route: "/registers", locale: "de-CH" });

  expect(await screen.findByText("Noch keine Register.")).toBeInTheDocument();
});

test("an empty library offers to add the first photo", async () => {
  server.use(http.get("/api/v1/images", () => HttpResponse.json(NOTHING)));

  setMockUser("demo.direction");
  await renderWithSession(<Media />, { route: "/media" });

  const empty = await screen.findByText(/La bibliothèque est vide/);
  const card = empty.closest('[data-state-message="empty"]');
  expect(card).not.toBeNull();
  // The same button as the one at the top of the page.
  expect(screen.getAllByRole("button", { name: "Ajouter des photos" })).toHaveLength(2);
});

test("nobody to chase points whoever may place members at the roster", async () => {
  server.use(http.get("/api/v1/events/:id/attendance", () => HttpResponse.json(NOTHING)));

  setMockUser("demo.direction");
  await renderWithSession(
    <Routes>
      <Route path="/events/:id/attendance" element={<EventAttendance />} />
    </Routes>,
    { route: "/events/7/attendance" },
  );

  expect(await screen.findByText(/Personne n’est encore inscrit dans un pupitre/)).toBeVisible();
  expect(screen.getByRole("link", { name: "Attribuer les pupitres" })).toHaveAttribute(
    "href",
    "/members",
  );
  // No "0 oui · 0 non · 0 sans réponse" under a sentence that already says it.
  expect(screen.queryByTestId("chase-counts")).toBeNull();
});

test("nobody to chase offers no roster link to who cannot place members", async () => {
  server.use(http.get("/api/v1/events/:id/attendance", () => HttpResponse.json(NOTHING)));

  setMockUser("demo.committee");
  await renderWithSession(
    <Routes>
      <Route path="/events/:id/attendance" element={<EventAttendance />} />
    </Routes>,
    { route: "/events/7/attendance" },
  );

  expect(await screen.findByText(/Personne n’est encore inscrit dans un pupitre/)).toBeVisible();
  expect(screen.queryByRole("link", { name: "Attribuer les pupitres" })).toBeNull();
});

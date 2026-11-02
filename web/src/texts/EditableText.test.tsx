import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, expect, test } from "vitest";

import { t } from "../i18n";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EDIT_MODE_KEY } from "./EditMode";
import { EditableText } from "./EditableText";

type Put = { path: string; body: unknown };

function recordPuts(): Put[] {
  const puts: Put[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "PUT" && new URL(request.url).pathname.startsWith("/api/v1/texts/")) {
      puts.push({ path: new URL(request.url).pathname, body: await request.clone().json() });
    }
  });
  return puts;
}

// Each test adds a listener of its own; none may outlive it.
afterEach(() => server.events.removeAllListeners());

async function asEditor() {
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
}

test("a visitor sees the text and no pencil", async () => {
  await renderWithSession(<EditableText k="join.facts.schedule.day" as="p" />);

  expect(screen.getByText(t("join.facts.schedule.day"))).toBeInTheDocument();
  expect(screen.queryByRole("button")).toBeNull();
});

test("an editor with edit mode off sees no pencil either", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<EditableText k="join.facts.schedule.day" as="p" />);

  expect(screen.queryByRole("button")).toBeNull();
});

test("an editor saves French and German, and the page shows the new text at once", async () => {
  const user = userEvent.setup();
  const puts = recordPuts();
  await asEditor();
  await renderWithSession(<EditableText k="join.facts.schedule.time" as="p" />);

  await user.click(screen.getByRole("button", { name: /^Modifier le texte/ }));
  const dialog = await screen.findByRole("dialog");
  const french = within(dialog).getByLabelText("Français");
  const german = within(dialog).getByLabelText("Deutsch");
  expect(french).toHaveValue("De 10h à 12h");
  await user.clear(french);
  await user.type(french, "De 9h à 11h");
  await user.clear(german);
  await user.type(german, "Von 9 bis 11 Uhr");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  expect(await screen.findByText("De 9h à 11h")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(puts).toEqual([
    {
      path: "/api/v1/texts/join.facts.schedule.time",
      body: { fr: "De 9h à 11h", de: "Von 9 bis 11 Uhr" },
    },
  ]);
});

test("saving the original wording unchanged stores nothing", async () => {
  const user = userEvent.setup();
  const puts = recordPuts();
  await asEditor();
  await renderWithSession(<EditableText k="join.facts.schedule.day" as="p" />);

  await user.click(screen.getByRole("button", { name: /^Modifier le texte/ }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Enregistrer" }),
  );

  await screen.findByText(t("join.facts.schedule.day"));
  expect(puts.map((put) => put.body)).toEqual([{ fr: null, de: null }]);
});

test("Rétablir puts the original wording back", async () => {
  const user = userEvent.setup();
  const puts = recordPuts();
  await asEditor();
  await renderWithSession(<EditableText k="join.facts.schedule.day" as="p" />);
  const original = t("join.facts.schedule.day");

  await user.click(screen.getByRole("button", { name: /^Modifier le texte/ }));
  const french = within(await screen.findByRole("dialog")).getByLabelText("Français");
  await user.clear(french);
  await user.type(french, "Autre chose");
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Enregistrer" }),
  );
  await screen.findByText("Autre chose");

  await user.click(screen.getByRole("button", { name: /^Modifier le texte/ }));
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Rétablir le texte d’origine",
    }),
  );

  expect(await screen.findByText(original)).toBeInTheDocument();
  expect(puts.at(-1)?.body).toEqual({ fr: null, de: null });
});

test("a language-neutral text has one field and is stored in both languages", async () => {
  const user = userEvent.setup();
  const puts = recordPuts();
  await asEditor();
  await renderWithSession(
    <EditableText k="committee.booking" as="p" neutral label="Numéro pour les prestations" />,
  );

  await user.click(
    screen.getByRole("button", { name: "Modifier le texte : Numéro pour les prestations" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByLabelText("Deutsch")).toBeNull();
  const field = within(dialog).getByLabelText("Texte");
  await user.clear(field);
  await user.type(field, "026 123 45 67");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await screen.findByText("026 123 45 67");
  expect(puts.at(-1)?.body).toEqual({ fr: "026 123 45 67", de: "026 123 45 67" });
});

test("stored lines each render on their own, and a Swiss number becomes a tel: link", async () => {
  server.use(
    http.get("/api/v1/texts", () =>
      HttpResponse.json({
        data: [
          {
            key: "join.intro",
            fr: "Anne Dupont, 079 123 45 67\n\nMarc Rossier, +41 26 555 12 34",
            de: null,
            updatedAt: "2026-11-02T10:00:00+00:00",
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
  await renderWithSession(<EditableText k="join.intro" as="p" multiline phones />);

  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "tel:+41791234567",
    "tel:+41265551234",
  ]);
  expect(screen.getByText(/Anne Dupont/)).toBeInTheDocument();
  expect(document.querySelectorAll("p")).toHaveLength(2);
});

test("an empty text renders the fallback, and an editor still gets a pencil", async () => {
  await asEditor();
  await renderWithSession(
    <EditableText
      k="committee.bookingNumber"
      as="p"
      neutral
      label="Numéro"
      empty={<span data-testid="gap">vide</span>}
    />,
  );

  expect(screen.getByTestId("gap")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Modifier le texte : Numéro" })).toBeInTheDocument();
});

test("a value the check refuses is not saved, and says why", async () => {
  const user = userEvent.setup();
  const puts = recordPuts();
  await asEditor();
  await renderWithSession(
    <EditableText
      k="join.intro"
      as="p"
      neutral
      label="Lien"
      validate={(value) =>
        value.startsWith("https://") ? null : "Une adresse https:// est attendue."
      }
    />,
  );

  await user.click(screen.getByRole("button", { name: "Modifier le texte : Lien" }));
  const field = within(await screen.findByRole("dialog")).getByLabelText("Texte");
  await user.clear(field);
  await user.type(field, "http://example.com");
  await user.click(
    within(await screen.findByRole("dialog")).getByRole("button", { name: "Enregistrer" }),
  );

  expect(await screen.findByText("Une adresse https:// est attendue.")).toBeInTheDocument();
  expect(puts).toEqual([]);
});

import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test, vi } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";

/** The list, addressed by its accessible name so the layout's nav cannot leak in. */
const rows = async () =>
  within(await screen.findByRole("list", { name: "Événements" })).getAllByRole("listitem");

/**
 * Fills every required input with something valid.
 *
 * Submitting an empty form does not reach the API — the inputs are `required`
 * and jsdom runs interactive validation, so no submit event fires — so a test
 * about the SERVER's answer has to hand the form a valid payload and let the
 * handler reject it.
 */
async function fillValidEvent(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Date :"), "2026-12-05");
  await user.type(screen.getByLabelText("Titre :"), "Cortège");
  await user.type(screen.getByLabelText("Heure de début :"), "14:00");
  await user.type(screen.getByLabelText("Heure de fin :"), "17:00");
  await user.type(screen.getByLabelText("Lieu :"), "Vieille-Ville");
}

test("an admin sees the form and the per-event controls", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  expect(await screen.findByLabelText("Date :")).toBeInTheDocument();
  expect(await screen.findAllByRole("button", { name: /^Supprimer/ })).toHaveLength(3);
});

test("each per-event control is named for its own event", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  // Three buttons all called "Supprimer" are indistinguishable to a screen
  // reader, which is the same class of bug as the old spans being unreachable
  // by keyboard. The visible label stays short; the accessible name does not.
  expect(
    await screen.findByRole("button", { name: "Supprimer Concert d'automne" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Modifier Concert d'automne" })).toBeInTheDocument();
});

test("a member without manage_events sees neither the form nor the controls", async () => {
  setMockUser("demo.user");
  await renderWithSession(<PlanningRepet />);
  await rows();
  expect(screen.queryByLabelText("Date :")).toBeNull();
  expect(screen.queryByRole("button", { name: /^Supprimer/ })).toBeNull();
});

test("creating an event adds it to the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);
  expect(await rows()).toHaveLength(3);

  await fillValidEvent(user);
  await user.click(screen.getByRole("button", { name: "Ajouter" }));

  await waitFor(async () => expect(await rows()).toHaveLength(4));
  expect((await rows())[3]).toHaveTextContent("Titre : Cortège");
});

test("editing an event fills the form and saves the change", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Modifier Concert d'automne" }));

  // Times come back from the API as SQL TIMEs ("19:00:00"); an <input type=time>
  // is fed HH:MM, exactly as the old page's edit handler sliced them.
  expect(screen.getByLabelText("Date :")).toHaveValue("2026-09-20");
  expect(screen.getByLabelText("Heure de début :")).toHaveValue("19:00");
  expect(screen.getByLabelText("Titre :")).toHaveValue("Concert d'automne");

  const title = screen.getByLabelText("Titre :");
  await user.clear(title);
  await user.type(title, "Concert d'hiver");
  await user.click(screen.getByRole("button", { name: "Modifier" }));

  await waitFor(async () => expect((await rows())[0]).toHaveTextContent("Titre : Concert d'hiver"));
  // The form returns to create mode once the edit lands.
  expect(await screen.findByRole("button", { name: "Ajouter" })).toBeInTheDocument();
});

test("cancelling an edit empties the form and returns it to create mode", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Modifier Concert d'automne" }));
  await user.click(screen.getByRole("button", { name: "Annuler" }));

  expect(screen.getByLabelText("Titre :")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Ajouter" })).toBeInTheDocument();
});

test("deleting an event removes it from the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));

  await waitFor(async () => expect(await rows()).toHaveLength(2));
});

test("declining the delete confirmation leaves the list alone", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));

  expect(await rows()).toHaveLength(3);
});

test("a validation error renders in French against the offending field", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  // Override the create handler for this test only: the mocked backend accepts
  // everything, and the point here is the error path.
  server.use(
    http.post("/api/events", () =>
      HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "startTime", reason: "required" }],
        },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(<PlanningRepet />);
  await fillValidEvent(user);
  await user.click(screen.getByRole("button", { name: "Ajouter" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Le formulaire contient des erreurs."),
  );
  expect(screen.getByText("Heure de début est requis")).toBeInTheDocument();
  expect(screen.getByLabelText("Heure de début :")).toHaveAttribute("aria-invalid", "true");
});

test("a rejected submission keeps what the admin typed", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  server.use(
    http.post("/api/events", () =>
      HttpResponse.json(
        { error: "Invalid form submission", code: "validation_failed", fields: [] },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(<PlanningRepet />);
  await fillValidEvent(user);
  await user.click(screen.getByRole("button", { name: "Ajouter" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Le formulaire contient des erreurs."),
  );
  expect(screen.getByLabelText("Titre :")).toHaveValue("Cortège");
});

// The fallback branch: not every failure is an ApiError. A network drop makes
// fetch itself reject, and the form still has to say something in French
// rather than fall through to an empty alert or an English message.
test("a network failure falls back to a French message", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  server.use(http.post("/api/events", () => HttpResponse.error()));

  await renderWithSession(<PlanningRepet />);
  await fillValidEvent(user);
  await user.click(screen.getByRole("button", { name: "Ajouter" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "L’enregistrement a échoué. Veuillez réessayer.",
    ),
  );
});

test("the submit button is marked unavailable while the request is in flight", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");

  // A handler held open on purpose, rather than racing a fast one: "still
  // pending" is otherwise a timing assertion, and a flaky test about a disabled
  // button is worse than no test at all.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.post("/api/events", async () => {
      await held;
      return HttpResponse.json({ ok: true }, { status: 201 });
    }),
  );

  await renderWithSession(<PlanningRepet />);
  await fillValidEvent(user);
  const submit = screen.getByRole("button", { name: "Ajouter" });
  await user.click(submit);

  await waitFor(() => expect(submit).toHaveAttribute("aria-disabled", "true"));
  release();
  await waitFor(() => expect(submit).toHaveAttribute("aria-disabled", "false"));
});

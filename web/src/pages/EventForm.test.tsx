import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { SEED, isoDaysFromToday, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { PlanningRepet } from "./PlanningRepet";
import { Toaster } from "@/components/ui/sonner";

/** The list, addressed by its accessible name so the layout's nav cannot leak in. */
const CONCERT = SEED.find((event) => event.title === "Concert d'automne")!;

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
  // An offset rather than a literal: the add test asserts this event shows up
  // in a list that filters to upcoming events.
  await user.type(await screen.findByLabelText("Date :"), isoDaysFromToday(95));
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
  // No "Titre :" label: the card shows the title on its own line now.
  expect((await rows())[3]).toHaveTextContent("Cortège");
});

test("editing an event fills the form and saves the change", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Modifier Concert d'automne" }));

  // Times come back from the API as SQL TIMEs ("19:00:00"); an <input type=time>
  // is fed HH:MM, exactly as the old page's edit handler sliced them.
  // Read off SEED rather than pinned as a literal: the fixture's dates are
  // offsets from today now, so a literal here would fail on a date nobody
  // chose. What this asserts is that the form is filled from the event it was
  // opened on, which is the same assertion it always made.
  expect(screen.getByLabelText("Date :")).toHaveValue(CONCERT.date);
  expect(screen.getByLabelText("Heure de début :")).toHaveValue("19:00");
  expect(screen.getByLabelText("Titre :")).toHaveValue("Concert d'automne");

  const title = screen.getByLabelText("Titre :");
  await user.clear(title);
  await user.type(title, "Concert d'hiver");
  await user.click(screen.getByRole("button", { name: "Modifier" }));

  await waitFor(async () => expect((await rows())[0]).toHaveTextContent("Concert d'hiver"));
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
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));
  // The dialog's own confirm button, not the row's trigger — the trigger
  // carries the event title in its accessible name, the dialog's does not.
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
  );

  await waitFor(async () => expect(await rows()).toHaveLength(2));
});

// The trigger is aria-disabled rather than disabled, so it stays focusable AND
// stays clickable — which makes the handler's early return the only thing
// preventing a second delete prompt over an in-flight one. Nothing else in the
// suite exercises that pending state. This replaces a window.confirm call-count
// assertion; the property is the same one.
test("a delete in flight marks the trigger unavailable and refuses to reopen", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.delete("/api/events/:id", async () => {
      await held;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<PlanningRepet />);
  const remove = await screen.findByRole("button", { name: "Supprimer Concert d'automne" });
  await user.click(remove);
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
  );

  await waitFor(() => expect(remove).toHaveAttribute("aria-disabled", "true"));

  // Clickable, because aria-disabled does not block the event — the guard does.
  await user.click(remove);
  expect(screen.queryByRole("alertdialog")).toBeNull();

  // Released, the trigger becomes available again. The row itself does not
  // vanish here: this override replaces the mock's real DELETE, which is what
  // removes it from the store — the test above covers that half.
  release();
  await waitFor(() => expect(remove).not.toHaveAttribute("aria-disabled", "true"));
});

// The failure path had NO coverage while it was a window.alert, and replacing it
// with a toast is exactly the moment to give it some: a toast that never renders
// looks identical to a delete that quietly did nothing.
//
// The Toaster is rendered HERE rather than relied upon, because it lives in
// Layout and renderWithSession mounts a page without one. That is not a fudge --
// it is the same reason the app mounts it once in the layout route, and without
// it toast.error() resolves into nothing at all, in a test as in a browser.
test("a failed delete says so, and leaves the row in place", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  server.use(
    http.delete("/api/events/:id", () =>
      HttpResponse.json({ error: "Server error", code: "server_error" }, { status: 500 }),
    ),
  );
  await renderWithSession(
    <>
      <PlanningRepet />
      <Toaster />
    </>,
  );

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Supprimer" }),
  );

  expect(
    await screen.findByText("La suppression de l’événement a échoué. Veuillez réessayer."),
  ).toBeInTheDocument();
  expect(await rows()).toHaveLength(3);
});

test("declining the delete confirmation leaves the list alone", async () => {
  const user = userEvent.setup();
  setMockUser("demo.admin");
  await renderWithSession(<PlanningRepet />);

  await user.click(await screen.findByRole("button", { name: "Supprimer Concert d'automne" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Annuler" }),
  );

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
        { status: 400 },
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
        { status: 400 },
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

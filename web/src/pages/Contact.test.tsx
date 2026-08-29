import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Contact } from "./Contact";

const app = (
  <Routes>
    <Route path="/contact" element={<Contact />} />
    <Route path="/confirmation" element={<p>Merci</p>} />
  </Routes>
);

async function fillValidMessage(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Nom:"), "Canard");
  await user.type(screen.getByLabelText("Prénom:"), "Donald");
  await user.type(screen.getByLabelText("E-mail:"), "donald@example.com");
  await user.type(screen.getByLabelText("Sujet:"), "Une question");
  await user.type(screen.getByLabelText("Contenu du message:"), "Bonjour les canetons !");
}

test("the five old fields are present, in the old order", async () => {
  await renderWithSession(app, { route: "/contact" });
  expect(await screen.findByRole("heading", { name: "Contact" })).toBeInTheDocument();
  expect(screen.getByLabelText("Contenu du message:").tagName).toBe("TEXTAREA");
});

// The old markup left `subject` optional while the API always required it, so a
// blank subject made a round trip and came back as a generic alert. Pinned so
// the fix is not "tidied" back to parity.
test("every field is required, subject included", async () => {
  await renderWithSession(app, { route: "/contact" });
  for (const label of ["Nom:", "Prénom:", "E-mail:", "Sujet:", "Contenu du message:"]) {
    expect(await screen.findByLabelText(label)).toBeRequired();
  }
});

test("a sent message lands on the confirmation page", async () => {
  const user = userEvent.setup();
  await renderWithSession(app, { route: "/contact" });
  await fillValidMessage(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(await screen.findByText("Merci")).toBeInTheDocument();
});

test("a validation error renders in French against the offending field", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/contact", () =>
      HttpResponse.json(
        {
          error: "Invalid form submission",
          code: "validation_failed",
          fields: [{ field: "email", reason: "invalid_format" }],
        },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(app, { route: "/contact" });
  await fillValidMessage(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Le formulaire contient des erreurs.");
  expect(screen.getByText("E-mail n'est pas dans un format valide")).toBeInTheDocument();
  expect(screen.getByLabelText("E-mail:")).toHaveAttribute("aria-invalid", "true");
  expect(screen.queryByText("Merci")).toBeNull();
});

test("a rejected message keeps what was typed", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/contact", () =>
      HttpResponse.json(
        { error: "Invalid form submission", code: "validation_failed", fields: [] },
        { status: 422 },
      ),
    ),
  );

  await renderWithSession(app, { route: "/contact" });
  await fillValidMessage(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  await screen.findByRole("alert");
  expect(screen.getByLabelText("Contenu du message:")).toHaveValue("Bonjour les canetons !");
});

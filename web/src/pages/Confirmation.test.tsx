import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Confirmation } from "./Confirmation";

test("it says the form was sent and that an email follows", () => {
  render(<Confirmation />);
  expect(
    screen.getByRole("heading", { name: "Formulaire envoyé avec succès !" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/vous recevrez bientôt un e-mail de confirmation/i)).toBeInTheDocument();
});

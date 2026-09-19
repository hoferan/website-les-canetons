import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { Join } from "./Join";

test("says how to join, in French by default", async () => {
  await renderWithSession(<Join />, { route: "/join" });

  expect(
    screen.getByRole("heading", { name: "Tu veux commencer la guggen ?" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Instruments recherchés")).toBeInTheDocument();
  expect(screen.getByText("Trompette")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "page de contact" })).toHaveAttribute("href", "/contact");
});

test("says how to join, in German", async () => {
  await renderWithSession(<Join />, { route: "/join", locale: "de-CH" });

  expect(
    screen.getByRole("heading", { name: "Willst du mit der Gugge anfangen?" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Gesuchte Instrumente")).toBeInTheDocument();
  expect(screen.getByText("Trompete")).toBeInTheDocument();
  // The two joining contacts are placeholders (see Join.tsx), one per seat.
  expect(screen.getAllByText(/Name und Nummer/)).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Kontaktseite" })).toHaveAttribute("href", "/contact");
});

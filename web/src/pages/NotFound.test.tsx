import { screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { NotFound } from "./NotFound";

test("shows the soft 404 in French by default", async () => {
  await renderWithSession(<NotFound />, { route: "/nope" });

  expect(screen.getByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Retour à l’accueil" })).toHaveAttribute("href", "/");
});

test("shows the soft 404 in German", async () => {
  await renderWithSession(<NotFound />, { route: "/nope", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Seite nicht gefunden" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Zurück zur Startseite" })).toHaveAttribute("href", "/");
});

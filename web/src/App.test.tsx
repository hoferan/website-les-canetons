import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import App from "./App";

test("the shell renders the band's name", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "Les Canetons de Fribourg" })).toBeDefined();
});

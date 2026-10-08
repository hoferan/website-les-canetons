import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Highlighted } from "./Highlighted";

test("marks the chosen words and keeps the sentence whole", () => {
  render(
    <h1>
      <Highlighted text="La guggen d’enfants de Fribourg." mark="d’enfants" />
    </h1>,
  );

  expect(
    screen.getByRole("heading", { name: "La guggen d’enfants de Fribourg." }),
  ).toBeInTheDocument();
  expect(screen.getByText("d’enfants")).toHaveClass("bg-highlight");
});

/** A translation that drops the word must still render, just without the mark. */
test("renders the plain text when the words are not in it", () => {
  const { container } = render(<Highlighted text="Die Kinder-Guggenmusik." mark="d’enfants" />);

  expect(container.textContent).toBe("Die Kinder-Guggenmusik.");
  expect(container.querySelector(".bg-highlight")).toBeNull();
});

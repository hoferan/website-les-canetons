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

test("lights the standalone word, not the same letters inside an earlier one", () => {
  const { container } = render(<Highlighted text="Les enfants en fête" mark="en" />);

  const lit = container.querySelector(".bg-highlight");
  expect(lit?.textContent).toBe("en");
  expect(lit?.previousSibling?.textContent).toBe("Les enfants ");
});

test("shows no highlight for a mark that is nowhere on word edges", () => {
  const { container } = render(<Highlighted text="Les enfants" mark="enf" />);

  expect(container.textContent).toBe("Les enfants");
  expect(container.querySelector(".bg-highlight")).toBeNull();
});

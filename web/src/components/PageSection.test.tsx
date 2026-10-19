import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { PageSection } from "./PageSection";

test("it renders its children inside a section", () => {
  render(
    <PageSection>
      <h1>Bienvenue</h1>
    </PageSection>,
  );
  expect(screen.getByRole("heading", { name: "Bienvenue" })).toBeInTheDocument();
});

// The width is asserted here, where it is owned, rather than on every page.
test("the default width is the shell, and the other two are opt-in", () => {
  const { container: shell } = render(<PageSection>a</PageSection>);
  expect(shell.firstChild).toHaveClass("max-w-shell");

  const { container: text } = render(<PageSection width="text">b</PageSection>);
  expect(text.firstChild).toHaveClass("max-w-text");

  const { container: form } = render(<PageSection width="form">c</PageSection>);
  expect(form.firstChild).toHaveClass("max-w-md");
});

test("a caller can add classes without losing the width", () => {
  const { container } = render(<PageSection className="mt-10">a</PageSection>);
  expect(container.firstChild).toHaveClass("max-w-shell");
  expect(container.firstChild).toHaveClass("mt-10");
});

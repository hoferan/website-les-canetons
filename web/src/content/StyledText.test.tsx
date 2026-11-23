import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { StyledText } from "./StyledText";

test("bold and italic render as strong and em, and the line break stays", () => {
  const { container } = render(
    <p>
      <StyledText text={"et **pas** de\n*matin*"} />
    </p>,
  );

  expect(screen.getByText("pas").tagName).toBe("STRONG");
  expect(screen.getByText("matin").tagName).toBe("EM");
  expect(container.querySelector("p")?.textContent).toBe("et pas de\nmatin");
});

test("bold and italic together nest em inside strong", () => {
  render(
    <p>
      <StyledText text="***tous***" />
    </p>,
  );

  const word = screen.getByText("tous");
  expect(word.tagName).toBe("EM");
  expect(word.parentElement?.tagName).toBe("STRONG");
});

test("a star that closes nothing shows as typed", () => {
  const { container } = render(
    <p>
      <StyledText text="5 * 3 et note*" />
    </p>,
  );

  expect(container.querySelector("p")?.textContent).toBe("5 * 3 et note*");
  expect(container.querySelector("strong, em")).toBeNull();
});

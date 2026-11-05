import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { SearchField } from "./SearchField";

test("the clear button is centred without a translate, which its press would override", () => {
  render(<SearchField id="q" label="Chercher" value="abc" onChange={() => {}} />);
  const clear = screen.getByRole("button");
  expect(clear.className).not.toMatch(/translate-/);
});

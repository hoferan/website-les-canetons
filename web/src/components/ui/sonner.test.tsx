import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { Toaster } from "./sonner";

// It renders without next-themes. If a `shadcn add` brings the registry
// version back, this fails on the missing module rather than in a browser.
test("the toaster renders without a theme provider", () => {
  const { container } = render(<Toaster />);
  expect(container).toBeTruthy();
});

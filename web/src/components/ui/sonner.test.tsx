import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { Toaster } from "./sonner";

// The one thing worth pinning about a vendored, rewritten component: it renders
// at all, without next-themes. If the registry version is ever re-added by a
// `shadcn add`, this fails on the missing module rather than at runtime in a
// browser.
test("the toaster renders without a theme provider", () => {
  const { container } = render(<Toaster />);
  expect(container).toBeTruthy();
});

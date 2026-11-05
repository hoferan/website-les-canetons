import { expect, test } from "vitest";

import { buttonVariants } from "./button";

test.each(["raised", "raised-light", "raised-violet", "raised-danger"] as const)(
  "%s hovers to a solid colour, never an alpha one",
  (variant) => {
    const hover = buttonVariants({ variant })
      .split(" ")
      .filter((name) => name.startsWith("hover:bg-"));
    expect(hover).toHaveLength(1);
    // A see-through hover lets a yellow page show through a yellow button.
    expect(hover[0]).not.toContain("/");
  },
);

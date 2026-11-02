// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

/**
 * Screens only an administrator opens load as chunks of their own, so no
 * visitor downloads their code: the photo library's upload queue (#294) and
 * the website's zip library (#336). An eager import in routes.tsx would put
 * them back into the bundle every public page loads.
 */
test.each(["Media", "MediaDetail", "Website"])("%s is loaded lazily", (page) => {
  const routes = readFileSync(join(process.cwd(), "web", "src", "routes.tsx"), "utf8");

  expect(routes).not.toMatch(new RegExp(`^import \\{[^}]*\\b${page}\\b[^}]*\\} from`, "m"));
  expect(routes).toMatch(new RegExp(`const ${page} = lazy\\(`));
});

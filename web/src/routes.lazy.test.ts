// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

/**
 * Every page behind the login loads as a chunk of its own, so no visitor
 * downloads its code (#396): among them the photo library's upload queue
 * (#294) and the website's zip library (#336). An eager import in routes.tsx
 * would put it back into the bundle every public page loads.
 */
const LAZY = [
  "Account",
  "AccountPassword",
  "ContactMessages",
  "EventAttendance",
  "EventEdit",
  "EventFormEditor",
  "EventNew",
  "EventRegistrations",
  "EventSeriesNew",
  "EventTags",
  "Events",
  "Inbox",
  "Login",
  "Members",
  "Registers",
  "Roles",
  "Media",
  "MediaDetail",
  "Website",
];
test.each(LAZY)("%s is loaded lazily", (page) => {
  const routes = readFileSync(join(process.cwd(), "web", "src", "routes.tsx"), "utf8");

  expect(routes).not.toMatch(new RegExp(`^import \\{[^}]*\\b${page}\\b[^}]*\\} from`, "m"));
  expect(routes).toMatch(new RegExp(`const ${page} = lazyNamed\\(`));
});

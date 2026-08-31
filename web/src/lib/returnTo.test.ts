import { expect, test } from "vitest";

import { safeReturnTo } from "./returnTo";

test("an ordinary in-app path is kept", () => {
  expect(safeReturnTo("/planning_repet")).toBe("/planning_repet");
  expect(safeReturnTo("/planning_repet?admin=true#top")).toBe("/planning_repet?admin=true#top");
});

test("the root is the fallback for anything absent", () => {
  expect(safeReturnTo(null)).toBe("/");
  expect(safeReturnTo(undefined)).toBe("/");
  expect(safeReturnTo("")).toBe("/");
  expect(safeReturnTo(42)).toBe("/");
});

// The old page needed an open-redirect guard because returnTo arrived as a URL
// in a link anyone could send. These are the shapes it defended against.
test("a protocol-relative URL is refused", () => {
  expect(safeReturnTo("//evil.com")).toBe("/");
});

test("a backslash protocol-relative URL is refused", () => {
  // Browsers normalise \ to / inside a URL, so "/\evil.com" is "//evil.com".
  expect(safeReturnTo("/\\evil.com")).toBe("/");
});

test("an absolute URL is refused", () => {
  expect(safeReturnTo("https://evil.com")).toBe("/");
  expect(safeReturnTo("http://evil.com")).toBe("/");
});

test("a javascript: URL is refused", () => {
  expect(safeReturnTo("javascript:alert(1)")).toBe("/");
});

test("a bare relative path is refused rather than guessed at", () => {
  expect(safeReturnTo("planning_repet")).toBe("/");
});

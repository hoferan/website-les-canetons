import { expect, test } from "vitest";

import { mailtoHref, telHref } from "./contactHref";

/**
 * A hostile-input list in the `returnTo.test.ts` spirit. Both invariant tests
 * below map the whole list, so a value added here is covered by both without
 * anyone remembering to.
 */
const HOSTILE = [
  "",
  "   ",
  "+",
  "-",
  "à demander",
  "079 123 45 67 p. 12",
  "079+123",
  "079 123 45 67 / 026 322 10 10",
  "079 123 45 67\nbcc:x",
  "٠٧٩ ١٢٣ ٤٥ ٦٧",
  "079\n123\n4567",
  "079 123 45 67",
  "+41 79 123 45 67",
];

test("a Swiss mobile keeps its digits and nothing else", () => {
  expect(telHref("079 123 45 67")).toBe("tel:0791234567");
});

test("an international number keeps its leading plus", () => {
  expect(telHref("+41 79 123 45 67")).toBe("tel:+41791234567");
});

test("separators of every kind are stripped", () => {
  expect(telHref("079/123.45.67")).toBe("tel:0791234567");
  expect(telHref("079-123-45-67")).toBe("tel:0791234567");
  expect(telHref("(079) 123 45 67")).toBe("tel:0791234567");
  // NBSP separators, as a paste out of a word processor gives them.
  expect(telHref("079 123 45 67")).toBe("tel:0791234567");
});

test("a 00 prefix is left as it was written, not turned into a plus", () => {
  // Rewriting 0041 to +41 is E.164 normalisation and belongs to the API.
  expect(telHref("0041 79 123 45 67")).toBe("tel:0041791234567");
});

test("surrounding whitespace does not hide the leading plus", () => {
  expect(telHref("  +41 79 123 45 67  ")).toBe("tel:+41791234567");
});

test("a value with nothing dialable in it is not a link", () => {
  expect(telHref("")).toBeNull();
  expect(telHref("   ")).toBeNull();
  expect(telHref("à demander")).toBeNull();
  expect(telHref("-")).toBeNull();
});

test("a value that is only a plus never produces a bare tel:+", () => {
  expect(telHref("+")).toBeNull();
  expect(telHref("+   ")).toBeNull();
});

test("too few digits to be a number anywhere", () => {
  expect(telHref("12")).toBeNull();
  expect(telHref("+4")).toBeNull();
});

test("a value carrying prose is not a link, because the concatenation would dial a stranger", () => {
  // Each of these has enough digits to produce a plausible-looking URI, and
  // each would reach the wrong person.
  expect(telHref("079 123 45 67 p. 12")).toBeNull();
  expect(telHref("079 123 45 67 ext 4")).toBeNull();
  expect(telHref("079 123 45 67 (privé)")).toBeNull();
  expect(telHref("079 123 45 67 ou 026 322 10 10")).toBeNull();
});

test("a plus that is not leading means two things, not one number", () => {
  expect(telHref("079+123")).toBeNull();
  expect(telHref("++41 79 123 45 67")).toBeNull();
  expect(telHref("+41 79 123+45 67")).toBeNull();
});

test("two numbers run together exceed E.164 and are refused", () => {
  // Twenty digits, no letters, so only the ceiling catches this one.
  expect(telHref("079 123 45 67 / 026 322 10 10")).toBeNull();
});

test("non-ASCII digits are refused rather than transliterated", () => {
  expect(telHref("٠٧٩ ١٢٣ ٤٥ ٦٧")).toBeNull();
  expect(telHref("０７９１２３４５６７")).toBeNull();
});

test("length is not a criterion; the digit ceiling is", () => {
  // EXISTS TO STOP a `max:64` mirror of the column being added here. A long
  // value holding one number is still that number.
  expect(telHref(`079${"-".repeat(200)}1234567`)).toBe("tel:0791234567");
});

test("a trunk prefix in brackets is left in, and that is a known limitation", () => {
  // `(0)` should be DROPPED when dialling internationally. Doing that is E.164
  // normalisation, which is a separate issue; this pins today's behaviour so
  // that issue changes it deliberately rather than discovering it. The number
  // fails to connect rather than reaching a stranger.
  expect(telHref("+41 (0)79 123 45 67")).toBe("tel:+410791234567");
});

test("every link telHref can produce is a scheme, an optional plus and digits", () => {
  const linked = HOSTILE.map(telHref).filter((href) => href !== null);

  // Without this the forEach below passes vacuously on an empty list.
  expect(linked.length).toBeGreaterThan(0);

  for (const href of linked) {
    expect(href).toMatch(/^tel:\+?[0-9]{3,15}$/);
  }
});

test("an ordinary address becomes a mailto", () => {
  expect(mailtoHref("jeanne.aebischer@example.ch")).toBe("mailto:jeanne.aebischer@example.ch");
});

test("surrounding whitespace is trimmed", () => {
  expect(mailtoHref("  jeanne@example.ch  ")).toBe("mailto:jeanne@example.ch");
});

test("a plus-tagged address is escaped, not corrupted", () => {
  // %2B rather than a literal `+`: RFC 6068 permits the literal, but a handler
  // that form-decodes reads `+` as a space and delivers to `jean souper@`.
  expect(mailtoHref("jean+souper@example.ch")).toBe("mailto:jean%2Bsouper@example.ch");
});

test("an ampersand or a question mark in a local part is escaped, not refused", () => {
  // Both are RFC 5322 atext, so both are addresses the API accepts. A blocklist
  // would refuse to link a valid address.
  const ampersand = mailtoHref("jean&marie@example.ch");
  const question = mailtoHref("who?@example.ch");

  expect(ampersand).toBe("mailto:jean%26marie@example.ch");
  expect(question).toBe("mailto:who%3F@example.ch");
  expect(ampersand).not.toMatch(/[?&]/);
  expect(question).not.toMatch(/[?&]/);
});

test("a tampered value cannot add a bcc", () => {
  expect(mailtoHref("a@b.ch?bcc=evil@x.ch")).toBe("mailto:a%40b.ch%3Fbcc%3Devil@x.ch");
});

test("a percent sign is escaped so it cannot be decoded twice", () => {
  // The hole a blocklist leaves open: `%3F` passed through, then decoded into
  // a `?` by a handler that decodes before splitting.
  expect(mailtoHref("a%3Fbcc%3Dx@b.ch")).toBe("mailto:a%253Fbcc%253Dx@b.ch");
});

test("a newline cannot survive into the href", () => {
  const href = mailtoHref("a\r\nbcc:evil@x.ch@b.ch");

  expect(href).not.toBeNull();
  expect(href).not.toMatch(/[\r\n]/);
});

test("a quoted local part is escaped rather than refused", () => {
  expect(mailtoHref('"jean dupont"@example.ch')).toBe("mailto:%22jean%20dupont%22@example.ch");
});

test("a value with no at-sign is not a link", () => {
  expect(mailtoHref("à demander")).toBeNull();
  expect(mailtoHref("example.ch")).toBeNull();
  expect(mailtoHref("")).toBeNull();
  expect(mailtoHref("   ")).toBeNull();
});

test("an at-sign with nothing on one side is not a link", () => {
  expect(mailtoHref("@example.ch")).toBeNull();
  expect(mailtoHref("jeanne@")).toBeNull();
  expect(mailtoHref("@")).toBeNull();
});

test("a malformed character cannot blank the guest list", () => {
  // A lone surrogate makes encodeURIComponent throw. One bad stored address
  // must cost one link, not the page.
  expect(mailtoHref("a\ud800@b.ch")).toBeNull();
});

test("no mailto this can produce carries a header field", () => {
  const addresses = [
    "jeanne@example.ch",
    "a@b.ch?bcc=evil@x.ch",
    "a%3Fbcc%3Dx@b.ch",
    "jean&marie@example.ch",
    "who?@example.ch",
    "jean+souper@example.ch",
    '"jean dupont"@example.ch',
    "à demander",
    "",
  ];

  const linked = addresses.map(mailtoHref).filter((href) => href !== null);

  expect(linked.length).toBeGreaterThan(0);

  for (const href of linked) {
    expect(href).toMatch(/^mailto:[^?&\s]*$/);
  }
});

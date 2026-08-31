// @vitest-environment node
import { expect, test } from "vitest";

import { solveChallenge } from "./altcha";
import type { Altcha200 } from "./generated/model";

/**
 * Runs under `node`, not jsdom: the solver needs a real WebCrypto SubtleCrypto,
 * and jsdom does not ship one. Node 18+ exposes `crypto.subtle` globally, so
 * this file needs no polyfill — but it MUST keep the pragma on line 1.
 */

const encoder = new TextEncoder();

/** The same digest the server computes, so a fixture is a real challenge. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function challengeFor(answer: number): Promise<Altcha200> {
  const salt = "salt-for-the-test";
  return {
    algorithm: "SHA-256",
    challenge: await sha256Hex(salt + answer),
    maxnumber: 50000,
    salt,
    signature: "a-signature-the-server-checks",
  };
}

test("it finds the number the challenge was built from", async () => {
  const challenge = await challengeFor(7);

  const solution = solveChallenge(challenge);

  expect(JSON.parse(atob(await solution))).toEqual({
    algorithm: "SHA-256",
    challenge: challenge.challenge,
    number: 7,
    salt: challenge.salt,
    signature: challenge.signature,
  });
});

// Zero is a real answer and a falsy one. A solver written with `if (n)` or
// `found || fallback` gets every other case right and this one wrong.
test("zero is a valid answer", async () => {
  const solution = await solveChallenge(await challengeFor(0));
  expect(JSON.parse(atob(solution)).number).toBe(0);
});

// Fail CLOSED, matching the server: an unverifiable challenge is a refusal,
// never a pass. A solver that resolved with an empty payload here would send a
// blank `altcha` and read as a server-side captcha bug.
test("an unsolvable challenge rejects rather than resolving with nothing", async () => {
  const challenge = await challengeFor(3);

  // `maxnumber: 5` shrinks the search space the exhaustion loop has to walk.
  // The behaviour under test is "the loop exhausts the space and throws" —
  // that path is identical whether the space is 6 digests or 50 001 of them,
  // so a tiny space gives the same coverage for roughly a ten-thousandth of
  // the work. Walking the real 50 000 here made this test a timing bomb: it
  // passed in isolation but blew past vitest's 5s default under full-suite
  // parallel load. The double cast is needed because orval types `maxnumber`
  // as the literal `50000`, read off `AltchaController::MAX_NUMBER` — and `5`
  // does not overlap that literal, so a direct `as Altcha200` is a compile
  // error (TS2352) rather than a narrowing.
  await expect(
    solveChallenge({
      ...challenge,
      challenge: "0".repeat(64),
      maxnumber: 5,
    } as unknown as Altcha200),
  ).rejects.toThrow(/pas pu|could not|unsolved/i);
});

test("a malformed challenge rejects", async () => {
  const challenge = await challengeFor(3);

  await expect(
    solveChallenge({ ...challenge, salt: undefined as unknown as string }),
  ).rejects.toThrow();
});

// A missing signature is the failure mode that shipped untested: `signature`
// used to pass through unchecked, so a response missing it would resolve
// happily here and only get caught server-side, as a `403 captcha_failed`
// that reads like an anti-bot failure rather than a client-side bug.
test("a challenge missing its signature rejects", async () => {
  const challenge = await challengeFor(3);

  await expect(
    solveChallenge({ ...challenge, signature: undefined as unknown as string }),
  ).rejects.toThrow();
});

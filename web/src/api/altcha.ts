import type { Altcha200 } from "./generated/model";

/**
 * The client half of the self-hosted Altcha proof-of-work.
 *
 * GET /api/altcha hands out `{algorithm, challenge, maxnumber, salt,
 * signature}`, where `challenge` is SHA-256(salt + n) for some n the server
 * chose. Finding n again is the work. POST /api/signups then verifies the
 * signature and consumes it once (App\Support\ChallengeGuard), so a solution
 * cannot be replayed.
 *
 * NOT a Web Worker. `maxnumber` is 50 000, the average answer is a few
 * thousand, and every crypto.subtle.digest() already yields to the event loop,
 * so the main thread stays responsive. A worker would add a build concern and
 * buy nothing measurable.
 *
 * A separate module from the form ON PURPOSE: this is the only part of the
 * signup page that can be tested without rendering anything, and the only part
 * whose failure mode (silently passing) is invisible in a browser.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Solve a challenge and return the base64 payload the API expects in `altcha`.
 *
 * Rejects rather than resolving with a falsy value when the challenge is
 * malformed or the space is exhausted. That is deliberate: this is the signup
 * form's only anti-automation defence, and the server FAILS CLOSED on anything
 * unverifiable. A solver that resolved with "" would turn "we could not solve
 * it" into a 403 `captcha_failed` from the server, which reads as a server
 * fault rather than a client one.
 */
export async function solveChallenge(challenge: Altcha200): Promise<string> {
  const { algorithm, salt, signature, maxnumber } = challenge;

  if (typeof salt !== "string" || typeof challenge.challenge !== "string") {
    throw new Error("Altcha challenge is malformed and could not be solved.");
  }

  for (let number = 0; number <= maxnumber; number++) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(salt + number));
    if (toHex(digest) === challenge.challenge) {
      return btoa(
        JSON.stringify({ algorithm, challenge: challenge.challenge, number, salt, signature }),
      );
    }
  }

  throw new Error("Altcha challenge could not be solved within maxnumber.");
}

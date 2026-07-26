// Tests for ./api.js — the single chokepoint every /api/* call in this app goes
// through, so a regression here breaks every form on the site at once.
//
// Run by `npm run test:js` via node:test. No browser runner and no jsdom: api.js
// touches only `document.cookie`, `fetch` and `Headers`, all of which are cheap
// to stub, and Node has `Headers` natively.
//
// The .mjs extension is load-bearing, not decorative. vite.config.js builds one
// entry per *.js file in this directory, so naming this api.test.js would ship a
// test file as a bundled entry. It stays out of the deploy artifact for a second,
// independent reason too: tools/build.mjs deletes dist/build/assets/js wholesale
// after copying app/, because the server only ever references the bundled output.
import assert from "node:assert/strict";
import test from "node:test";

// A representative Laravel XSRF-TOKEN cookie value: base64 payloads really do
// contain "+", "/" and a trailing "=", and Laravel stores them percent-encoded.
const ENCODED_TOKEN = "tok%2Bwith%2Fchars%3D";
const DECODED_TOKEN = "tok+with/chars=";

let instance = 0;

// api.js holds module-level state (the shared in-flight prime), so each test
// needs its own instance of it — hence the cache-busting import query. Returns
// the module's apiFetch plus a harness recording what reached the network.
async function loadApi({ cookie = "", primeDelayMs = 0 } = {}) {
  const harness = { calls: [], primeCount: 0, cookie };

  globalThis.document = {
    get cookie() {
      return harness.cookie;
    },
  };

  globalThis.fetch = async (url, options) => {
    harness.calls.push({ url, options });
    if (url === "/sanctum/csrf-cookie") {
      harness.primeCount++;
      if (primeDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, primeDelayMs));
      }
      // Laravel sets it alongside the session cookie, and the browser holds
      // whatever else it already had — so the reader must pick it out of a list
      // rather than assume the cookie string is just the token.
      harness.cookie = `les-canetons-api-session=abc; XSRF-TOKEN=${ENCODED_TOKEN}; other=x`;
      return { ok: true, status: 204 };
    }
    return { ok: true, status: 200 };
  };

  instance += 1;
  const mod = await import(new URL(`./api.js?instance=${instance}`, import.meta.url));
  return { apiFetch: mod.apiFetch, harness };
}

const apiCalls = (harness) => harness.calls.filter((c) => c.url !== "/sanctum/csrf-cookie");

test("the X-XSRF-TOKEN header carries the DECODED cookie value, never the raw cookie", async () => {
  const { apiFetch, harness } = await loadApi();
  await apiFetch("/api/contact", { method: "POST", body: "form-data" });

  const sent = apiCalls(harness)[0].options.headers.get("X-XSRF-TOKEN");

  // Regression guard for a bug confirmed against the running stack, sending
  // POST /api/contact with Origin: http://localhost:8090:
  //
  //   no X-XSRF-TOKEN header at all       -> 419 {"error":"Invalid session",...}
  //   header = cookie value verbatim      -> 419 {"error":"Invalid session",...}
  //   header = decodeURIComponent(cookie) -> 200 {"ok":true}
  //
  // Laravel writes the cookie percent-encoded (a real one ends "...IjoiIn0%3D")
  // but compares the header against the DECODED token. So dropping the
  // decodeURIComponent() in api.js is indistinguishable from sending no token:
  // every mutating request from a real browser 419s, public forms included.
  // It looks like a redundant call. It is not. Do not simplify it away.
  assert.equal(sent, DECODED_TOKEN);
  assert.notEqual(sent, ENCODED_TOKEN, "sending the cookie value verbatim is the 419 bug");
});

test("concurrent mutating callers share ONE /sanctum/csrf-cookie request", async () => {
  // The prime is deliberately slow so all three POSTs are in flight before it
  // resolves. That window is the only place a per-caller prime can happen, and
  // therefore the only way this test can catch one — with an instant prime the
  // calls would serialise and a broken implementation would still pass.
  const { apiFetch, harness } = await loadApi({ primeDelayMs: 25 });

  await Promise.all([
    apiFetch("/api/contact", { method: "POST" }),
    apiFetch("/api/login", { method: "POST" }),
    apiFetch("/api/logout", { method: "POST" }),
  ]);

  assert.equal(
    harness.primeCount,
    1,
    `three concurrent POSTs must prime the CSRF cookie exactly once, not ${harness.primeCount} times`,
  );
  assert.equal(apiCalls(harness).length, 3, "all three requests must still be sent");
  for (const call of apiCalls(harness)) {
    assert.equal(
      call.options.headers.get("X-XSRF-TOKEN"),
      DECODED_TOKEN,
      `${call.url} must carry the token even though it did not prime`,
    );
  }
});

test("GET and HEAD never prime — a read-only page must not fetch a cookie it cannot use", async () => {
  const { apiFetch, harness } = await loadApi();

  await apiFetch("/api/events", { method: "GET" });
  await apiFetch("/api/signups", { method: "HEAD" });
  await apiFetch("/api/altcha", { headers: { Accept: "application/json" } }); // no method => GET

  assert.equal(harness.primeCount, 0);
  assert.equal(apiCalls(harness).length, 3);
  // Safe methods are passed straight through, so a plain-object `headers` stays
  // exactly the object the caller supplied.
  assert.deepEqual(apiCalls(harness)[2].options.headers, { Accept: "application/json" });
});

test("a lowercase method is still recognised as safe", async () => {
  const { apiFetch, harness } = await loadApi();
  await apiFetch("/api/events", { method: "get" });
  assert.equal(harness.primeCount, 0);
});

test("an XSRF-TOKEN cookie already present short-circuits priming entirely", async () => {
  const { apiFetch, harness } = await loadApi({
    cookie: `foo=bar; XSRF-TOKEN=${ENCODED_TOKEN}`,
  });

  await apiFetch("/api/responses", { method: "POST" });

  assert.equal(harness.primeCount, 0, "an existing cookie must not trigger a prime");
  assert.equal(apiCalls(harness)[0].options.headers.get("X-XSRF-TOKEN"), DECODED_TOKEN);
});

test("a later mutating call reuses the primed cookie instead of priming again", async () => {
  const { apiFetch, harness } = await loadApi();

  await apiFetch("/api/events", { method: "POST" });
  await apiFetch("/api/events", { method: "PUT" });
  await apiFetch("/api/events?id=7", { method: "DELETE" });

  assert.equal(harness.primeCount, 1, "one prime per page load, not one per request");
  for (const call of apiCalls(harness)) {
    assert.equal(call.options.headers.get("X-XSRF-TOKEN"), DECODED_TOKEN);
  }
});

test("caller-supplied headers, body and credentials survive the CSRF wrapping", async () => {
  const { apiFetch, harness } = await loadApi();

  await apiFetch("/api/signups", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: '{"first_name":"Jean"}',
  });

  const sent = apiCalls(harness)[0].options;
  assert.equal(sent.headers.get("Content-Type"), "application/json");
  assert.equal(sent.headers.get("Accept"), "application/json");
  assert.equal(sent.headers.get("X-XSRF-TOKEN"), DECODED_TOKEN);
  assert.equal(sent.body, '{"first_name":"Jean"}');
  assert.equal(sent.credentials, "same-origin", "cookies must be sent");
  assert.equal(sent.method, "POST");
});

test("a FormData body gets no Content-Type forced on it", async () => {
  const { apiFetch, harness } = await loadApi();

  // contact.js posts `new FormData(form)`. If api.js ever set a default
  // Content-Type, the browser could no longer add its own multipart boundary
  // and the server would fail to parse a single field.
  const body = new FormData();
  body.append("lastName", "Test");
  await apiFetch("/api/contact", { method: "POST", body });

  const sent = apiCalls(harness)[0].options;
  assert.equal(sent.headers.get("Content-Type"), null);
  assert.equal(sent.body, body, "the FormData instance must be passed through untouched");
});

test("an explicit credentials option is respected rather than overwritten", async () => {
  const { apiFetch, harness } = await loadApi();
  await apiFetch("/api/login", { method: "POST", credentials: "include" });
  assert.equal(apiCalls(harness)[0].options.credentials, "include");
});

test("the caller's own options object is never mutated", async () => {
  const { apiFetch } = await loadApi();

  const options = { method: "PUT", headers: { "Content-Type": "application/json" } };
  await apiFetch("/api/events", options);

  assert.deepEqual(
    options,
    { method: "PUT", headers: { "Content-Type": "application/json" } },
    "apiFetch must copy, not decorate, what it was handed",
  );
});

test("a failed prime still sends the request, so the call site reports the real failure", async () => {
  const { apiFetch, harness } = await loadApi();
  // Simulate /sanctum/csrf-cookie being unreachable: no cookie is ever set.
  globalThis.fetch = async (url, options) => {
    harness.calls.push({ url, options });
    if (url === "/sanctum/csrf-cookie") {
      harness.primeCount++;
      throw new Error("network down");
    }
    return { ok: false, status: 419 };
  };

  const response = await apiFetch("/api/contact", { method: "POST" });

  assert.equal(harness.primeCount, 1);
  assert.equal(apiCalls(harness).length, 1, "the request is still attempted");
  assert.equal(response.status, 419, "and its failure surfaces to the caller as a Response");
});

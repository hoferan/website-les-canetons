import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, customFetch, resetCsrfPriming } from "./http";

// A Response body can only be read once, ever. Every fetch mock below is
// built with mockImplementation (never mockResolvedValue) so each call to
// fetch() gets a FRESH Response instance, matching how a real fetch() never
// returns the same Response object twice. Sharing one instance across calls
// would only work by the accident of which of those calls happen to read the
// body — invisible when reading a single test in isolation, and one added
// body read away from "Body is unusable: Body has already been read".
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.restoreAllMocks();
  resetCsrfPriming();
});

describe("customFetch", () => {
  it("sends cookies, because Sanctum authenticates by session cookie", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/config", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("prefixes the API base, so callers pass spec-relative paths", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/config", { method: "GET" });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/config");
  });

  it("primes the CSRF cookie before the first mutating request", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/login", {
      method: "POST",
      body: JSON.stringify({ username: "a", password: "b" }),
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/sanctum/csrf-cookie");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/login");
  });

  it("primes only once across several mutations", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/login", { method: "POST", body: JSON.stringify({}) });
    await customFetch("/responses", { method: "POST", body: JSON.stringify({}) });

    const primingCalls = fetchMock.mock.calls.filter((c) => c[0] === "/sanctum/csrf-cookie");
    expect(primingCalls).toHaveLength(1);
  });

  it("does not prime for reads", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/events", { method: "GET" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a typed ApiError carrying code and fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: "Invalid form submission",
              code: "validation_failed",
              fields: [{ field: "email", reason: "required" }],
            },
            400,
          ),
        ),
      ),
    );

    const error = (await customFetch("/contact", {
      method: "POST",
      body: JSON.stringify({}),
    }).catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe("validation_failed");
    expect(error.fields).toEqual([{ field: "email", reason: "required" }]);
  });

  it("still throws an ApiError when the body is not the contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response("<html>502</html>", { status: 502 })),
        ),
    );

    const error = (await customFetch("/events", { method: "GET" }).catch(
      (e: unknown) => e,
    )) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe("unknown_error");
  });
});

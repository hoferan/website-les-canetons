/**
 * The one place this project's API peculiarities live.
 *
 * orval generates every endpoint and TanStack Query hook, and routes them all
 * through customFetch below, so no generated file is ever hand-edited and no
 * call site has to remember any of the following:
 *
 *  - Sanctum authenticates by SESSION COOKIE, so every request needs
 *    credentials: 'include'.
 *  - Sanctum rejects a mutating request with 419 unless the XSRF cookie has been
 *    seeded by GET /sanctum/csrf-cookie first. That path is NOT under /api.
 *  - A successful call returns orval's ENVELOPE, { data, status, headers } —
 *    not the parsed body. Every generated signature declares that shape, so
 *    returning the body alone type-checks everywhere and is undefined at
 *    runtime. Call sites read `.data`; through a TanStack Query hook that
 *    reads `query.data.data`, the outer one being Query's own.
 *  - Errors use this API's own contract, {error, code, fields[]}, not Laravel's
 *    {message, errors}. `code` and `fields[].reason` are stable machine tokens
 *    the display layer translates into French; they are never shown raw.
 *
 * Signature note: orval's `httpClient: 'fetch'` mode calls its mutator as
 * `customFetch<T>(url, options)` — a URL string (already spec-relative, with
 * any query string already appended by the generated `getXUrl()` helper) and a
 * plain RequestInit (method, headers, body already JSON.stringify'd when there
 * is one) — not a single config object. That's the real, installed orval
 * 8.23.0 contract, so this mutator's parameter shape follows it rather than a
 * hand-designed one.
 */

/** Spec paths are relative to /api; the SPA is served from the same origin. */
const API_BASE = "/api";
const CSRF_COOKIE_PATH = "/sanctum/csrf-cookie";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ApiErrorField = {
  field: string;
  reason: string;
  params?: Record<string, unknown>;
};

/**
 * Thrown for every non-2xx response, so callers (and TanStack Query's error
 * state) always receive one type. `code` falls back to 'unknown_error' when the
 * body is not the contract at all — an HTML 502 from the host, say — because the
 * display layer must always have a token to translate.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ApiErrorField[];

  constructor(status: number, code: string, message: string, fields: ApiErrorField[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let csrfPrimed = false;

/** Test seam: lets a test start from an unprimed state. */
export function resetCsrfPriming(): void {
  csrfPrimed = false;
}

async function primeCsrf(): Promise<void> {
  if (csrfPrimed) return;
  await fetch(CSRF_COOKIE_PATH, { method: "GET", credentials: "include" });
  csrfPrimed = true;
}

export async function customFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? "GET").toString().toUpperCase();

  if (MUTATING.has(method)) {
    await primeCsrf();
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    method,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  // orval's `httpClient: 'fetch'` contract is that a mutator returns the
  // ENVELOPE, not the bare body: every generated signature declares it, e.g.
  // `eventIndexResponse = { data: …; status: 200 } & { headers: Headers }`.
  // Returning the parsed body alone therefore type-checks at every call site
  // and is `undefined` at runtime — a whole page's data silently missing, with
  // no compiler error anywhere. Do not "simplify" this back.
  //
  // 204 carries `data: null` rather than being absent, so a caller can read
  // `.data` unconditionally.
  const data = response.status === 204 ? null : await response.json();

  return { data, status: response.status, headers: response.headers } as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(response.status, "unknown_error", `HTTP ${response.status}`);
  }

  const contract = body as { error?: string; code?: string; fields?: ApiErrorField[] };
  if (typeof contract?.code !== "string") {
    return new ApiError(response.status, "unknown_error", `HTTP ${response.status}`);
  }

  return new ApiError(
    response.status,
    contract.code,
    contract.error ?? `HTTP ${response.status}`,
    contract.fields ?? [],
  );
}

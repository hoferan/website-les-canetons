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
 *  - Errors are RFC 9457 problem documents on application/problem+json, not
 *    Laravel's {message, errors}. `code` and `errors[].reason` are stable
 *    machine tokens the display layer translates into French; they are never
 *    shown raw. `title` is English prose for a log and must never be rendered.
 *
 * Signature note: orval's `httpClient: 'fetch'` mode calls its mutator as
 * `customFetch<T>(url, options)` — a URL string (already spec-relative, with
 * any query string already appended by the generated `getXUrl()` helper) and a
 * plain RequestInit (method, headers, body already JSON.stringify'd when there
 * is one) — not a single config object. That's the real, installed orval
 * 8.23.0 contract, so this mutator's parameter shape follows it rather than a
 * hand-designed one.
 */

/**
 * Spec paths are relative to /api/v1; the SPA is served from the same origin.
 * The version prefix is part of the contract — App\Http\Middleware\ApiVersion::PREFIX
 * on the Laravel side — and moving to a v2 means changing it here too.
 */
const API_BASE = "/api/v1";
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
 *
 * `fields` keeps its name here even though the wire calls it `errors`: on this
 * side it is one property of an Error object, and `error.errors` reads as a
 * mistake. The wire name follows RFC 9457 convention; this one follows what the
 * UI does with it, which is highlight fields.
 *
 * `requestId` is the string a member reads out when something failed. It is
 * optional because a body that is not our contract has none.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ApiErrorField[];
  readonly requestId?: string;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: ApiErrorField[] = [],
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.requestId = requestId;
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

  // An RFC 9457 problem document. `type` and `title` are the standard members;
  // `code`, `errors`, `requestId` and `documentation` are this API's extensions
  // — see App\Exceptions\ApiError. Only `code` is load-bearing here: it is the
  // token the French layer maps, and a body without one is not our contract.
  //
  // `type` and `documentation` are declared but deliberately not carried onto
  // ApiError. `type` is a URN saying the same thing as `code`, and
  // `documentation` points at the English developer reference — neither belongs
  // on a French screen. They are typed so the shape here stays an honest
  // description of the wire.
  const problem = body as {
    title?: string;
    code?: string;
    errors?: ApiErrorField[];
    requestId?: string;
    documentation?: string;
  };

  if (typeof problem?.code !== "string") {
    return new ApiError(response.status, "unknown_error", `HTTP ${response.status}`);
  }

  return new ApiError(
    response.status,
    problem.code,
    problem.title ?? `HTTP ${response.status}`,
    problem.errors ?? [],
    typeof problem.requestId === "string" ? problem.requestId : undefined,
  );
}

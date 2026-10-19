/**
 * The one place this project's API peculiarities live.
 *
 * orval routes every generated endpoint and TanStack Query hook through
 * customFetch below, so no call site has to remember any of this:
 *
 *  - Sanctum authenticates by session cookie, so every request needs
 *    credentials: 'include'.
 *  - Sanctum rejects a write with 419 unless GET /sanctum/csrf-cookie (not
 *    under /api) has seeded the XSRF cookie first.
 *  - A successful call returns orval's envelope, { data, status, headers },
 *    not the parsed body. Through a TanStack Query hook that reads
 *    `query.data.data`, the outer one being Query's own.
 *  - Errors are RFC 9457 problem documents. `code` and `errors[].reason` are
 *    machine tokens the i18n layer translates and never shows raw. `title` is
 *    English prose for a log and is never rendered.
 *
 * orval's `httpClient: 'fetch'` mode calls the mutator as
 * `customFetch<T>(url, options)`: a spec-relative URL with any query string
 * already appended, and a plain RequestInit with the body already stringified.
 */

/**
 * Spec paths are relative to /api/v1, on the same origin. The prefix mirrors
 * App\Http\Middleware\ApiVersion::PREFIX; a v2 changes both.
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
 * Thrown for every non-2xx response. `code` falls back to 'unknown_error' when
 * the body is not the contract (an HTML 502 from the host, say), so the i18n
 * layer always has a token to translate.
 *
 * `fields` is the wire's `errors`, renamed because `error.errors` reads as a
 * mistake.
 *
 * `requestId` is the string a member reads out when something failed; a body
 * that is not our contract has none.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: ApiErrorField[];
  readonly requestId?: string;
  /** Seconds the server asked us to wait (`Retry-After`), or null when it sent none. */
  readonly retryAfter: number | null;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: ApiErrorField[] = [],
    requestId?: string,
    retryAfter: number | null = null,
  ) {
    super(message);
    this.retryAfter = retryAfter;
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

  // The mutator returns the envelope every generated signature declares, e.g.
  // `eventIndexResponse = { data: …; status: 200 } & { headers: Headers }`.
  // The bare body would type-check at every call site and be `undefined` at
  // runtime (contract.test.ts and http.test.ts pin both halves).
  //
  // 204 carries `data: null`, so a caller can read `.data` unconditionally.
  const data = response.status === 204 ? null : await response.json();

  return { data, status: response.status, headers: response.headers } as T;
}

/**
 * `Retry-After` as whole seconds. The throttle middleware sends delta-seconds;
 * an HTTP-date is read too, since a proxy may rewrite it. Anything else is null.
 */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(
      response.status,
      "unknown_error",
      `HTTP ${response.status}`,
      [],
      undefined,
      retryAfter,
    );
  }

  // An RFC 9457 problem document, with this API's `code`, `errors` and
  // `requestId` extensions (App\Exceptions\ApiError). There is no `type`.
  //
  // A body without `code` is not our contract. `detail` is English prose for a
  // developer and is typed here but never carried onto ApiError, because
  // nothing English reaches a member's screen.
  const problem = body as {
    title?: string;
    code?: string;
    errors?: ApiErrorField[];
    requestId?: string;
    detail?: string;
  };

  if (typeof problem?.code !== "string") {
    return new ApiError(
      response.status,
      "unknown_error",
      `HTTP ${response.status}`,
      [],
      undefined,
      retryAfter,
    );
  }

  return new ApiError(
    response.status,
    problem.code,
    problem.title ?? `HTTP ${response.status}`,
    problem.errors ?? [],
    typeof problem.requestId === "string" ? problem.requestId : undefined,
    retryAfter,
  );
}

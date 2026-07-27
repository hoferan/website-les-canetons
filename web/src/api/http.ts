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

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
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
